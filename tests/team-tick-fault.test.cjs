'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {createTeamServer} = require('../server/team-server.cjs');

test('an exception after partial 60Hz world mutation fails closed without crashing HTTP', async () => {
  const server = createTeamServer({port: 0, autoTick: true});
  const match = server.match;
  match.join('player-a', 'A');
  match.join('player-b', 'B');
  match.command('player-a', {seq: 1, type: 'ready'});
  match.command('player-b', {seq: 1, type: 'ready'});
  assert.equal(match.phase, 'playing');
  let attemptedTicks = 0;
  match.step = () => {
    attemptedTicks++;
    // Emulate a defect that mutates competitive state before throwing.
    match.score.red = 99;
    throw new Error('injected authoritative tick fault');
  };
  const {port} = await server.listen();
  const base = `http://127.0.0.1:${port}`;
  try {
    let health;
    for (let attempt = 0; attempt < 60; attempt++) {
      health = await fetch(base + '/health');
      if (health.status === 503) break;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.equal(health.status, 503, 'a failed simulation must not report healthy');
    assert.deepEqual(await health.json(), {
      status: 'degraded', protocol: 1, phase: 'ended', error: 'simulation_unavailable'
    });
    assert.equal(match.phase, 'ended');
    assert.equal(match.reason, 'simulation_error');
    assert.equal(match.winner, null, 'partial score cannot award a fictitious victory');
    assert.equal((await fetch(base + '/state', {
      headers: {'x-player-token': 'player-a'}
    })).status, 503, 'partially mutated state must never reach a player');
    const post = (route, body) => fetch(base + route, {
      method: 'POST', headers: {'content-type': 'application/json'},
      body: JSON.stringify(body)
    });
    const join = await post('/join', {name: 'C'});
    assert.equal(join.status, 503, 'new matches cannot start with the tick loop stopped');
    assert.equal((await join.json()).error, 'simulation_unavailable');
    assert.equal((await post('/command', {seq: 2, type: 'ready'})).status, 503);
    assert.equal((await fetch(base + '/')).status, 200,
      'static client stays accessible for a visible connection error');
    await new Promise(resolve => setTimeout(resolve, 35));
    assert.equal(attemptedTicks, 1, 'failed tick must not replay or continue running');
  } finally {
    await server.close();
  }
});

test('healthy local server still reports its authoritative phase and accepts joins', async () => {
  const server = createTeamServer({port: 0, autoTick: false});
  const {port} = await server.listen();
  const base = `http://127.0.0.1:${port}`;
  try {
    const health = await fetch(base + '/health');
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), {status: 'ok', protocol: 1, phase: 'lobby'});
    const join = await fetch(base + '/join', {
      method: 'POST', headers: {'content-type': 'application/json'},
      body: JSON.stringify({name: 'A'})
    });
    assert.equal(join.status, 201);
  } finally {
    await server.close();
  }
});
