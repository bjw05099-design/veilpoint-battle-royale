'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {TeamMatch} = require('../src/team-match.cjs');
const {createTeamServer} = require('../server/team-server.cjs');

test('lobby timeout clears a survivor ready vote before a new opponent joins', () => {
  let now = 0;
  const match = new TeamMatch({now: () => now});
  match.join('a', 'A');
  match.join('stale', 'B');
  match.command('a', {seq: 1, type: 'ready'});
  now = 25000;
  match.command('a', {seq: 2, type: 'heartbeat'});
  now = 30001;
  match.join('new', 'C');
  assert.equal(match.players.get('a').ready, false);
  match.command('new', {seq: 1, type: 'ready'});
  assert.equal(match.phase, 'lobby', 'replacement cannot start without renewed consent');
  match.command('a', {seq: 3, type: 'ready'});
  assert.equal(match.phase, 'playing');
  assert.equal(match.ticks, 0, 'seat replacement must not advance the 60Hz clock');
});

test('voluntary lobby departure also invalidates the surviving ready vote', () => {
  const match = new TeamMatch();
  match.join('a', 'A');
  match.join('b', 'B');
  match.command('a', {seq: 1, type: 'ready'});
  match.command('b', {seq: 1, type: 'leave'});
  assert.equal(match.players.get('a').ready, false);
  match.join('new', 'C');
  match.command('new', {seq: 1, type: 'ready'});
  assert.equal(match.phase, 'lobby');
  match.command('a', {seq: 2, type: 'ready'});
  assert.equal(match.phase, 'playing');
});

test('two HTTP clients cannot inherit a stale ready vote after a seat expires', async () => {
  let now = 0;
  const server = createTeamServer({port: 0, autoTick: false, now: () => now});
  const {port} = await server.listen();
  const base = 'http://127.0.0.1:' + port;
  const post = async (route, body, token) => {
    const response = await fetch(base + route, {
      method: 'POST',
      headers: {'content-type': 'application/json',
        ...(token ? {'x-player-token': token} : {})},
      body: JSON.stringify(body)
    });
    assert.equal(response.ok, true);
    return response.json();
  };
  const state = async token => {
    const response = await fetch(base + '/state', {
      headers: {'x-player-token': token}
    });
    assert.equal(response.status, 200);
    return response.json();
  };
  try {
    const a = await post('/join', {name: 'A'});
    await post('/join', {name: 'B'});
    await post('/command', {seq: 1, type: 'ready'}, a.token);
    now = 25000;
    await post('/command', {seq: 2, type: 'heartbeat'}, a.token);
    now = 30001;
    const c = await post('/join', {name: 'C'});
    assert.equal((await state(a.token)).self.ready, false);
    await post('/command', {seq: 1, type: 'ready'}, c.token);
    assert.equal((await state(c.token)).phase, 'lobby');
    await post('/command', {seq: 3, type: 'ready'}, a.token);
    assert.equal((await state(c.token)).phase, 'playing');
  } finally {
    await server.close();
  }
});
