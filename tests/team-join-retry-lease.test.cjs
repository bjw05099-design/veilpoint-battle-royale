'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {createTeamServer} = require('../server/team-server.cjs');

// The clock is injected: no real-time sleeps or dependence on CI scheduling.
async function fixture(run) {
  let clock = 0;
  const server = createTeamServer({port: 0, autoTick: false, now: () => clock});
  const {port} = await server.listen();
  const base = `http://127.0.0.1:${port}`;
  const post = async (path, body, token) => {
    const response = await fetch(base + path, {
      method: 'POST', headers: {'content-type': 'application/json',
        ...(token ? {'x-player-token': token} : {})},
      body: JSON.stringify(body)
    });
    return {status: response.status, body: await response.json()};
  };
  const state = async token => {
    const response = await fetch(base + '/state',
      {headers: {'x-player-token': token}});
    return {status: response.status, body: await response.json()};
  };
  try {await run({post, state, match: server.match, setNow: value => {clock = value;}});}
  finally {await server.close();}
}

test('lost lobby join response can recover the same seat near lease expiry', async () => {
  await fixture(async ({post, state, match, setNow}) => {
    const attemptId = 'a'.repeat(32);
    const first = await post('/join', {name: 'Captain A', attemptId});
    assert.equal(first.status, 201);
    setNow(29000);
    const retry = await post('/join', {name: 'Ignored rename', attemptId});
    assert.equal(retry.status, 200);
    assert.equal(retry.body.token, first.body.token);
    assert.equal(retry.body.name, 'Captain A');
    assert.equal(match.players.size, 1);
    // Without lease renewal the original 30-second timeout would evict this
    // legitimate player despite their successfully recovered join response.
    setNow(35000);
    assert.equal((await state(first.body.token)).status, 200);
    setNow(59001);
    assert.equal((await state(first.body.token)).status, 400,
      'read-only polling still cannot renew the lobby lease');
  });
});

test('join retry cannot renew an expired combatant or evade the round timeout', async () => {
  await fixture(async ({post, state, match, setNow}) => {
    const aId = 'b'.repeat(32), bId = 'c'.repeat(32);
    const a = (await post('/join', {name: 'A', attemptId: aId})).body;
    const b = (await post('/join', {name: 'B', attemptId: bId})).body;
    assert.equal((await post('/command', {seq: 1, type: 'ready'}, a.token)).status, 200);
    assert.equal((await post('/command', {seq: 1, type: 'ready'}, b.token)).status, 200);
    assert.equal(match.phase, 'playing');
    setNow(20000);
    const validRetry = await post('/join', {name: 'A', attemptId: aId});
    assert.equal(validRetry.status, 200);
    assert.equal(validRetry.body.token, a.token);
    assert.equal(match.players.get(a.token).lastSeen, 0,
      'an unauthenticated join retry must not renew an active combat lease');
    setNow(29000);
    assert.equal((await post('/command', {seq: 2, type: 'heartbeat'}, b.token)).status, 200);
    setNow(30001);
    const expiredRetry = await post('/join', {name: 'New A', attemptId: aId});
    assert.equal(expiredRetry.status, 201);
    assert.notEqual(expiredRetry.body.token, a.token);
    assert.equal((await state(a.token)).status, 400);
    assert.equal(match.phase, 'lobby');
    assert.equal(match.players.size, 2);
    assert.equal(match.players.get(b.token).ready, false,
      'a replacement must require fresh ready consent');
  });
});
