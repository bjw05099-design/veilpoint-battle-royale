'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {TeamMatch, CAPTURE_SECONDS, STEP} = require('../src/team-match.cjs');
const {createTeamServer} = require('../server/team-server.cjs');

function round() {
  const m = new TeamMatch({now: () => 0});
  m.join('a', 'A');m.join('b', 'B');
  m.command('a', {seq: 1, type: 'ready'});
  m.command('b', {seq: 1, type: 'ready'});
  m.players.get('a').x = 0;
  return m;
}
function advance(m, seqStart, token = 'a') {
  let seq = seqStart;
  for (let i = 0; i < CAPTURE_SECONDS / STEP; i++) {
    m.step();
    if (i === 59) m.command(token, {seq: seq++, type: 'capture', active: true});
  }
  return seq;
}

test('receiving a hit cancels relay authorization and cannot be bypassed by held renewal', () => {
  const m = round(), a = m.players.get('a');
  m.command('a', {seq: 2, type: 'capture', active: true});
  for (let i = 0; i < 60; i++) m.step();
  assert.ok(m.progress.red > 0.9);
  assert.equal(m.command('b', {seq: 2, type: 'fire'}).hit, true);
  assert.equal(a.health, 66);
  assert.equal(a.captureArmed, false);
  assert.equal(m.progress.red, 0);
  advance(m, 3);
  assert.equal(m.score.red, 0, 'renewed held key cannot restart an interrupted relay');
  m.command('a', {seq: 4, type: 'capture', active: false});
  m.command('a', {seq: 5, type: 'capture', active: true});
  advance(m, 6);
  assert.equal(m.score.red, 1);
  assert.equal(a.health, 66, 'objective interaction does not heal damage');
});

test('held-trigger damage also disarms a physical relay press', () => {
  const m = round(), a = m.players.get('a');
  m.command('a', {seq: 2, type: 'capture', active: true});
  for (let i = 0; i < 60; i++) m.step();
  m.command('b', {seq: 2, type: 'trigger', active: true});
  m.step();
  m.command('b', {seq: 3, type: 'trigger', active: false});
  assert.equal(a.health, 66);
  assert.equal(a.captureArmed, false);
  assert.equal(m.progress.red, 0);
  advance(m, 3);
  assert.equal(m.score.red, 0);
});

test('two authenticated HTTP clients cannot queue capture while moving', async () => {
  const server = createTeamServer({port: 0, autoTick: false});
  const {port} = await server.listen();
  const base = 'http://127.0.0.1:' + port;
  const post = async (path, payload, token) => {
    const response = await fetch(base + path, {method: 'POST',
      headers: {'content-type': 'application/json', ...(token ? {'x-player-token': token} : {})},
      body: JSON.stringify(payload)});
    assert.ok(response.ok, path + ': HTTP ' + response.status);
    return response.json();
  };
  try {
    const a = await post('/join', {name: 'A'});
    const b = await post('/join', {name: 'B'});
    await post('/command', {seq: 1, type: 'ready'}, a.token);
    await post('/command', {seq: 1, type: 'ready'}, b.token);
    server.match.players.get(a.token).x = 0;
    await post('/command', {seq: 2, type: 'move', direction: {x: 1, z: 0}}, a.token);
    await post('/command', {seq: 3, type: 'capture', active: true}, a.token);
    await post('/command', {seq: 4, type: 'move', direction: {x: 0, z: 0}}, a.token);
    for (let i = 0; i < 120; i++) {
      server.match.step();
      if (i === 59) await post('/command', {seq: 5, type: 'capture', active: true}, a.token);
    }
    assert.equal(server.match.score.red, 0);
    await post('/command', {seq: 6, type: 'capture', active: false}, a.token);
    await post('/command', {seq: 7, type: 'capture', active: true}, a.token);
    for (let i = 0; i < 120; i++) {
      server.match.step();
      if (i === 59) await post('/command', {seq: 8, type: 'capture', active: true}, a.token);
    }
    const snapshot = await (await fetch(base + '/state',
      {headers: {'x-player-token': a.token}})).json();
    assert.equal(snapshot.score.red, 1);
    assert.equal(snapshot.self.captureArmed, false);
  } finally {await server.close();}
});
