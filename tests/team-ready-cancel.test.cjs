'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {TeamMatch} = require('../src/team-match.cjs');
const {createTeamServer} = require('../server/team-server.cjs');

test('sequenced lobby cancellation revokes only the consenting player', () => {
  const m = new TeamMatch({now: () => 0});
  m.join('a', 'A'); m.join('b', 'B');
  assert.deepEqual(m.snapshot('a').lobby, {participants: 2, ready: 0});
  m.command('a', {seq: 1, type: 'ready'});
  assert.deepEqual(m.snapshot('b').lobby, {participants: 2, ready: 1});
  assert.equal(m.command('a', {seq: 2, type: 'unready'}).ready, false);
  assert.throws(() => m.command('a', {seq: 2, type: 'ready'}), /invalid_sequence/);
  m.command('b', {seq: 1, type: 'ready'});
  assert.equal(m.phase, 'lobby');
  assert.deepEqual(m.snapshot('a').lobby, {participants: 2, ready: 1});
  m.command('a', {seq: 3, type: 'ready'});
  assert.equal(m.phase, 'playing');
  assert.equal(m.command('a', {seq: 4, type: 'unready'}).reason, 'round_active');
  assert.equal(m.phase, 'playing');
});

test('loopback HTTP clients see the same public consent counts and cannot reuse a canceled vote', async () => {
  const server = createTeamServer({port: 0, autoTick: false, now: () => 0});
  const {port} = await server.listen();
  const base = 'http://127.0.0.1:' + port;
  const post = async (route, body, token) => {
    const r = await fetch(base + route, {method: 'POST',
      headers: {'content-type': 'application/json',
        ...(token ? {'x-player-token': token} : {})}, body: JSON.stringify(body)});
    assert.ok(r.ok); return r.json();
  };
  const state = async token => {
    const r = await fetch(base + '/state', {headers: {'x-player-token': token}});
    assert.equal(r.status, 200); return r.json();
  };
  try {
    const a = await post('/join', {name: 'A'});
    const b = await post('/join', {name: 'B'});
    await post('/command', {seq: 1, type: 'ready'}, a.token);
    assert.deepEqual((await state(a.token)).lobby, (await state(b.token)).lobby);
    assert.equal((await state(b.token)).self.ready, false);
    await post('/command', {seq: 2, type: 'unready'}, a.token);
    await post('/command', {seq: 1, type: 'ready'}, b.token);
    assert.equal((await state(b.token)).phase, 'lobby');
    assert.deepEqual((await state(b.token)).lobby, {participants: 2, ready: 1});
    await post('/command', {seq: 3, type: 'ready'}, a.token);
    assert.equal((await state(b.token)).phase, 'playing');
  } finally {await server.close();}
});
