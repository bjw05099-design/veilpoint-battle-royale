'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const {createTeamServer} = require('../server/team-server.cjs');

// Hold the last bytes of a valid JSON request until the authoritative tick
// has failed. This reproduces the asynchronous readJson gap in both POST paths.
function delayedPost(port, route, payload, token) {
  const body = JSON.stringify(payload);
  let resolve, reject;
  const response = new Promise((yes, no) => {resolve = yes;reject = no;});
  const req = http.request({hostname: '127.0.0.1', port, path: route,
    method: 'POST', headers: {
      'content-type': 'application/json',
      'content-length': Buffer.byteLength(body),
      ...(token ? {'x-player-token': token} : {})
    }}, res => {
    let text = '';
    res.setEncoding('utf8');
    res.on('data', chunk => {text += chunk;});
    res.on('end', () => {
      try {resolve({status: res.statusCode, body: JSON.parse(text)});}
      catch (error) {reject(error);}
    });
    res.on('error', reject);
  });
  req.on('error', reject);
  const split = Math.max(1, Math.floor(body.length / 2));
  req.write(body.slice(0, split));
  req.flushHeaders();
  return {response, finish: () => req.end(body.slice(split)), abort: () => req.destroy()};
}

async function waitForFault(port) {
  for (let i = 0; i < 80; i++) {
    const response = await fetch('http://127.0.0.1:' + port + '/health');
    if (response.status === 503) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.fail('injected authoritative tick did not fail');
}

async function faultDuringPost({route, payload, activeRound}) {
  const server = createTeamServer({port: 0, autoTick: true});
  const match = server.match;
  if (activeRound) {
    match.join('red-token', 'Red');
    match.join('blue-token', 'Blue');
    match.command('red-token', {seq: 1, type: 'ready'});
    match.command('blue-token', {seq: 1, type: 'ready'});
  }
  let armed = false;
  const step = match.step.bind(match);
  match.step = () => {
    if (armed) {
      // A partial world mutation must never be followed by a slow POST.
      match.score.red = 99;
      throw new Error('injected fault during pending body upload');
    }
    step();
  };
  const {port} = await server.listen();
  let pending;
  try {
    pending = delayedPost(port, route, payload, activeRound ? 'red-token' : null);
    // Let the first half of the request reach readJson while healthy.
    await new Promise(resolve => setTimeout(resolve, 45));
    armed = true;
    await waitForFault(port);
    pending.finish();
    const reply = await pending.response;
    assert.equal(reply.status, 503);
    assert.deepEqual(reply.body, {error: 'simulation_unavailable'});
    assert.equal(match.phase, 'ended');
    assert.equal(match.reason, 'simulation_error');
    if (activeRound) {
      assert.equal(match.players.get('red-token').seq, 1,
        'an admitted heartbeat cannot renew a damaged match after fault');
      assert.equal(match.players.size, 2);
    } else {
      assert.equal(match.players.size, 0,
        'a delayed join cannot allocate a seat after simulation failure');
    }
  } finally {
    pending?.abort();
    await server.close();
  }
}

test('in-flight authenticated command fails closed if 60Hz authority faults during upload', async () => {
  await faultDuringPost({route: '/command', payload: {seq: 2, type: 'heartbeat'},
    activeRound: true});
});

test('in-flight join cannot create a lobby seat after 60Hz authority faults', async () => {
  await faultDuringPost({route: '/join', payload: {name: 'Late participant'},
    activeRound: false});
});
