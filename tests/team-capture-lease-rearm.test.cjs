'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {TeamMatch, INPUT_LEASE_TICKS, CAPTURE_SECONDS, STEP} = require('../src/team-match.cjs');
const {createTeamServer} = require('../server/team-server.cjs');

function round() {
  const m = new TeamMatch({now: () => 0});
  m.join('a', 'Alpha');m.join('b', 'Bravo');
  m.command('a', {seq: 1, type: 'ready'});
  m.command('b', {seq: 1, type: 'ready'});
  m.players.get('a').x = 0;
  return m;
}
function advance(m, count) {for (let i = 0; i < count; i++) m.step();}

test('expired relay lease disarms stale held capture, requiring a physical release/press', () => {
  const m = round(), a = m.players.get('a');
  m.command('a', {seq: 2, type: 'capture', active: true});
  advance(m, INPUT_LEASE_TICKS + 1);
  assert.equal(a.capturing, false);
  assert.equal(a.captureArmed, false, 'expiry must revoke physical authorization');
  assert.equal(a.captureHeld, true, 'renewed active:true is not a fresh press');
  assert.equal(m.progress.red, 0);
  m.command('a', {seq: 3, type: 'heartbeat'});
  m.command('a', {seq: 4, type: 'capture', active: true});
  for (let i = 0; i < CAPTURE_SECONDS / STEP; i++) {
    m.step();
    if (i === 59) m.command('a', {seq: 5, type: 'capture', active: true});
  }
  assert.equal(m.score.red, 0, 'a delayed renewal must never complete the old press');
  assert.equal(m.progress.red, 0);
  m.command('a', {seq: 6, type: 'capture', active: false});
  m.command('a', {seq: 7, type: 'capture', active: true});
  assert.equal(a.captureArmed, true);
  for (let i = 0; i < CAPTURE_SECONDS / STEP; i++) {
    m.step();
    if (i === 59) m.command('a', {seq: 8, type: 'capture', active: true});
  }
  assert.equal(m.score.red, 1, 'fresh stationary interaction still works');
});

test('two authenticated HTTP clients cannot resume an expired relay press by renewing active:true', async () => {
  const server = createTeamServer({port: 0, autoTick: false});
  const {port} = await server.listen();
  const base = 'http://127.0.0.1:' + port;
  const post = async (route, payload, token) => {
    const response = await fetch(base + route, {method: 'POST',
      headers: {'content-type': 'application/json',
        ...(token ? {'x-player-token': token} : {})},
      body: JSON.stringify(payload)});
    assert.ok(response.ok, route + ': ' + response.status);
    return response.json();
  };
  try {
    const a = await post('/join', {name: 'A'});
    const b = await post('/join', {name: 'B'});
    await post('/command', {seq: 1, type: 'ready'}, a.token);
    await post('/command', {seq: 1, type: 'ready'}, b.token);
    server.match.players.get(a.token).x = 0;
    await post('/command', {seq: 2, type: 'capture', active: true}, a.token);
    advance(server.match, INPUT_LEASE_TICKS + 1);
    assert.equal(server.match.snapshot(a.token).self.captureArmed, false);
    await post('/command', {seq: 3, type: 'capture', active: true}, a.token);
    advance(server.match, 60);
    await post('/command', {seq: 4, type: 'capture', active: true}, a.token);
    advance(server.match, 60);
    assert.equal(server.match.score.red, 0);
    await post('/command', {seq: 5, type: 'capture', active: false}, a.token);
    await post('/command', {seq: 6, type: 'capture', active: true}, a.token);
    advance(server.match, 60);
    await post('/command', {seq: 7, type: 'capture', active: true}, a.token);
    advance(server.match, 60);
    const snapshot = await (await fetch(base + '/state',
      {headers: {'x-player-token': a.token}})).json();
    assert.equal(snapshot.score.red, 1);
    assert.equal(snapshot.self.captureArmed, false);
  } finally {await server.close();}
});
