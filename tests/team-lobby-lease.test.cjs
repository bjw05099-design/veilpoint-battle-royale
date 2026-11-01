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

test('expired finished-round heartbeat cannot revive a rematch seat', () => {
  let now = 0;
  const match = new TeamMatch({now: () => now});
  match.join('a', 'A');match.join('b', 'B');
  match.command('a', {seq: 1, type: 'ready'});
  match.command('b', {seq: 1, type: 'ready'});
  match.finish('red', 'objective_score');
  now = 30001;
  assert.equal(match.snapshot('a').phase, 'ended',
    'completed results remain readable until an explicit command');
  assert.throws(() => match.command('a', {seq: 2, type: 'heartbeat'}), /unknown_player/);
  assert.equal(match.players.size, 0);
  assert.equal(match.phase, 'lobby');
});

test('expired finished peer cannot rejoin via heartbeat while a live peer keeps its result', () => {
  let now = 0;
  const match = new TeamMatch({now: () => now});
  match.join('active', 'A');match.join('stale', 'B');
  match.command('active', {seq: 1, type: 'ready'});
  match.command('stale', {seq: 1, type: 'ready'});
  now = 25000;
  match.command('active', {seq: 2, type: 'heartbeat'});
  match.finish('red', 'objective_score');
  now = 30001;
  assert.throws(() => match.command('stale', {seq: 2, type: 'heartbeat'}), /unknown_player/);
  assert.equal(match.snapshot('active').phase, 'ended');
  assert.equal(match.snapshot('active').winner, 'red');
  match.join('replacement', 'C');
  match.command('active', {seq: 3, type: 'ready'});
  match.command('replacement', {seq: 1, type: 'ready'});
  assert.equal(match.phase, 'playing');
});

test('expired finished pair resets the entire old result before new guests see a lobby', () => {
  let now = 0;
  const match = new TeamMatch({now: () => now});
  match.join('old-red', 'Old Red');
  match.join('old-blue', 'Old Blue');
  match.command('old-red', {seq: 1, type: 'ready'});
  match.command('old-blue', {seq: 1, type: 'ready'});
  for (let i = 0; i < 30; i++) match.step();
  match.score.red = 2;
  match.progress.blue = 0.75;
  match.finish('red', 'objective_score');
  assert.equal(match.winner, 'red');
  assert.equal(match.ticks, 30);
  now = 30001;
  match.step();
  assert.equal(match.phase, 'lobby');
  assert.equal(match.players.size, 0);
  assert.deepEqual(match.score, {red: 0, blue: 0});
  assert.deepEqual(match.progress, {red: 0, blue: 0});
  assert.equal(match.ticks, 0);
  assert.equal(match.winner, null);
  assert.equal(match.reason, null);
  match.join('new-red', 'New Red');
  const view = match.snapshot('new-red');
  assert.equal(view.phase, 'lobby');
  assert.deepEqual(view.score, {red: 0, blue: 0});
  assert.equal(view.winner, null);
  assert.equal(view.reason, null);
  assert.equal(view.round.remainingTicks, view.round.limitTicks);
});

test('HTTP replacement guests never inherit an expired previous match result', async () => {
  let now = 0;
  const server = createTeamServer({port: 0, autoTick: false, now: () => now});
  const {port} = await server.listen();
  const base = 'http://127.0.0.1:' + port;
  const join = async name => {
    const response = await fetch(base + '/join', {method: 'POST',
      headers: {'content-type': 'application/json'}, body: JSON.stringify({name})});
    assert.equal(response.status, 201);
    return response.json();
  };
  try {
    await join('Old A');
    await join('Old B');
    server.match.phase = 'ended';
    server.match.score.red = 2;
    server.match.winner = 'red';
    server.match.reason = 'objective_score';
    server.match.ticks = 777;
    now = 30001;
    const newcomer = await join('New A');
    const response = await fetch(base + '/state', {headers: {'x-player-token': newcomer.token}});
    assert.equal(response.status, 200);
    const state = await response.json();
    assert.equal(state.phase, 'lobby');
    assert.deepEqual(state.score, {red: 0, blue: 0});
    assert.equal(state.winner, null);
    assert.equal(state.reason, null);
    assert.equal(state.tick, 0);
    assert.equal(state.round.remainingTicks, state.round.limitTicks);
  } finally {
    await server.close();
  }
});
