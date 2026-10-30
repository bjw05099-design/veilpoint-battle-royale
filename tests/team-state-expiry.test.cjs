'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {TeamMatch} = require('../src/team-match.cjs');
const {createTeamServer} = require('../server/team-server.cjs');

function started() {
  let now = 0;
  const match = new TeamMatch({now: () => now});
  match.join('a', 'A');
  match.join('b', 'B');
  match.command('a', {seq: 1, type: 'ready'});
  match.command('b', {seq: 1, type: 'ready'});
  return {match, setNow: value => {now = value;}};
}

test('state read finalizes one-sided timeout before the next 60Hz tick', () => {
  const {match, setNow} = started();
  setNow(25000);
  match.command('b', {seq: 2, type: 'heartbeat'});
  setNow(30001);
  const state = match.snapshot('b');
  assert.equal(state.phase, 'ended');
  assert.equal(state.winner, 'blue');
  assert.equal(state.reason, 'connection_timeout');
  assert.equal(state.tick, 0, 'read must not advance combat time');
  assert.equal(match.players.get('b').lastSeen, 25000,
    'read-only state polling cannot renew a session lease');
  assert.equal(match.snapshot('a').winner, 'blue',
    'second reader cannot overwrite an already settled result');
});

test('both expired peers cannot receive a phantom timeout winner', () => {
  const {match, setNow} = started();
  setNow(30001);
  const state = match.snapshot('a');
  assert.equal(state.phase, 'ended');
  assert.equal(state.winner, null);
  assert.equal(state.reason, 'connection_timeout');
  assert.equal(state.tick, 0);
});

test('fresh heartbeats retain playing phase without polling extending leases', () => {
  const {match, setNow} = started();
  setNow(25000);
  match.command('a', {seq: 2, type: 'heartbeat'});
  match.command('b', {seq: 2, type: 'heartbeat'});
  setNow(35000);
  assert.equal(match.snapshot('a').phase, 'playing');
  assert.equal(match.snapshot('b').phase, 'playing');
  assert.equal(match.players.get('a').lastSeen, 25000);
});

test('HTTP state and health reflect an expired session without autoTick', async () => {
  let now = 0;
  const server = createTeamServer({port: 0, autoTick: false, now: () => now});
  const {port} = await server.listen();
  const base = 'http://127.0.0.1:' + port;
  const post = async (route, body, token) => {
    const response = await fetch(base + route, {method: 'POST',
      headers: {'content-type': 'application/json',
        ...(token ? {'x-player-token': token} : {})}, body: JSON.stringify(body)});
    assert.ok(response.ok);
    return response.json();
  };
  try {
    const a = await post('/join', {name: 'A'});
    const b = await post('/join', {name: 'B'});
    await post('/command', {seq: 1, type: 'ready'}, a.token);
    await post('/command', {seq: 1, type: 'ready'}, b.token);
    now = 25000;
    await post('/command', {seq: 2, type: 'heartbeat'}, b.token);
    now = 30001;
    const view = await fetch(base + '/state', {headers: {'x-player-token': b.token}});
    assert.equal(view.status, 200);
    const state = await view.json();
    assert.equal(state.phase, 'ended');
    assert.equal(state.winner, 'blue');
    assert.equal(state.reason, 'connection_timeout');
    assert.equal(server.match.ticks, 0);
    const health = await (await fetch(base + '/health')).json();
    assert.equal(health.phase, 'ended');
    assert.equal(server.match.players.get(b.token).lastSeen, 25000);
  } finally {await server.close();}
});

test('HTTP health alone reconciles both expired clients without a timer tick', async () => {
  let now = 0;
  const server = createTeamServer({port: 0, autoTick: false, now: () => now});
  const {port} = await server.listen();
  const base = 'http://127.0.0.1:' + port;
  const post = async (body, token) => {
    const response = await fetch(base + (token ? '/command' : '/join'), {
      method: 'POST', headers: {'content-type': 'application/json',
        ...(token ? {'x-player-token': token} : {})}, body: JSON.stringify(body)});
    assert.ok(response.ok);
    return response.json();
  };
  try {
    const a = await post({name: 'A'}), b = await post({name: 'B'});
    await post({seq: 1, type: 'ready'}, a.token);
    await post({seq: 1, type: 'ready'}, b.token);
    now = 30001;
    const health = await (await fetch(base + '/health')).json();
    assert.equal(health.phase, 'ended');
    assert.equal(server.match.reason, 'connection_timeout');
    assert.equal(server.match.winner, null);
    assert.equal(server.match.ticks, 0);
  } finally {await server.close();}
});
