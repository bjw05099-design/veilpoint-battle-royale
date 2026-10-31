'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {TeamMatch} = require('../src/team-match.cjs');
const {createTeamServer} = require('../server/team-server.cjs');

test('an expired ready guest cannot start a phantom round between 60Hz ticks', () => {
  let now = 0;
  const match = new TeamMatch({now: () => now});
  match.join('active', 'A');
  match.join('expired', 'B');
  match.command('expired', {seq: 1, type: 'ready'});
  now = 25000;
  match.command('active', {seq: 1, type: 'heartbeat'});
  now = 30001;
  assert.throws(() => match.command('expired', {seq: 2, type: 'ready'}), /unknown_player/);
  assert.equal(match.phase, 'lobby');
  assert.deepEqual([...match.players.keys()], ['active']);
  assert.equal(match.players.get('active').ready, false);
  match.join('replacement', 'C');
  assert.equal(match.players.get('replacement').team, 'blue');
  match.command('active', {seq: 2, type: 'ready'});
  match.command('replacement', {seq: 1, type: 'ready'});
  assert.equal(match.phase, 'playing');
  assert.equal(match.ticks, 0, 'lobby reconciliation does not simulate combat time');
});

test('read-only lobby snapshots reject stale tokens without a server tick', () => {
  let now = 0;
  const match = new TeamMatch({now: () => now});
  match.join('active', 'A');
  match.join('expired', 'B');
  now = 25000;
  match.command('active', {seq: 1, type: 'heartbeat'});
  now = 30001;
  assert.throws(() => match.snapshot('expired'), /unknown_player/);
  assert.equal(match.snapshot('active').phase, 'lobby');
  assert.deepEqual([...match.players.keys()], ['active']);
  assert.equal(match.players.get('active').lastSeen, 25000,
    'state polling must not extend the active guest lease');
});

test('finished rematch seats also expire before a delayed ready command', () => {
  let now = 0;
  const match = new TeamMatch({now: () => now});
  match.join('a', 'A');
  match.join('b', 'B');
  match.command('a', {seq: 1, type: 'ready'});
  match.command('b', {seq: 1, type: 'ready'});
  match.finish('red', 'objective_score');
  now = 30001;
  assert.throws(() => match.command('a', {seq: 2, type: 'ready'}), /unknown_player/);
  assert.equal(match.phase, 'lobby');
  assert.equal(match.players.size, 0);
});

test('HTTP late lobby ready/state cannot reserve an expired seat or block a new guest', async () => {
  let now = 0;
  const server = createTeamServer({port: 0, autoTick: false, now: () => now});
  const {port} = await server.listen();
  const base = 'http://127.0.0.1:' + port;
  const post = async (path, body, token) => {
    const response = await fetch(base + path, {method: 'POST',
      headers: {'content-type': 'application/json',
        ...(token ? {'x-player-token': token} : {})}, body: JSON.stringify(body)});
    return {status: response.status, body: await response.json()};
  };
  try {
    const a = (await post('/join', {name: 'A'})).body;
    const b = (await post('/join', {name: 'B'})).body;
    assert.equal((await post('/command', {seq: 1, type: 'ready'}, b.token)).status, 200);
    now = 25000;
    assert.equal((await post('/command', {seq: 1, type: 'heartbeat'}, a.token)).status, 200);
    now = 30001;
    const stale = await post('/command', {seq: 2, type: 'ready'}, b.token);
    assert.equal(stale.status, 400);
    assert.equal(stale.body.error, 'unknown_player');
    const view = await fetch(base + '/state', {headers: {'x-player-token': b.token}});
    assert.equal(view.status, 400);
    assert.equal((await view.json()).error, 'unknown_player');
    const c = await post('/join', {name: 'C'});
    assert.equal(c.status, 201);
    assert.equal(c.body.team, 'blue');
    assert.equal((await post('/command', {seq: 2, type: 'ready'}, a.token)).status, 200);
    assert.equal((await post('/command', {seq: 1, type: 'ready'}, c.body.token)).status, 200);
    const active = await fetch(base + '/state', {headers: {'x-player-token': a.token}});
    assert.equal((await active.json()).phase, 'playing');
    assert.equal(server.match.ticks, 0);
  } finally {
    await server.close();
  }
});
