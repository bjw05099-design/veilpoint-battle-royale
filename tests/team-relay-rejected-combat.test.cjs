'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {TeamMatch} = require('../src/team-match.cjs');

function activeRelay() {
  const match = new TeamMatch({now: () => 0});
  match.join('a', 'A');
  match.join('b', 'B');
  match.command('a', {seq: 1, type: 'ready'});
  match.command('b', {seq: 1, type: 'ready'});
  const player = match.players.get('a');
  player.x = 0;
  match.command('a', {seq: 2, type: 'capture', active: true});
  for (let i = 0; i < 60; i++) match.step();
  assert.ok(match.progress.red > .9, 'relay must be actively transmitting before interruption');
  return {match, player};
}

function assertDisarmed(match, player, label) {
  assert.equal(match.progress.red, 0, label + ' must immediately discard partial capture');
  assert.equal(player.captureArmed, false, label + ' must revoke the physical console press');
  match.command('a', {seq: 4, type: 'capture', active: true});
  for (let i = 0; i < 120; i++) {
    match.step();
    if (i === 59) match.command('a', {seq: 5, type: 'capture', active: true});
  }
  assert.equal(match.score.red, 0, label + ' must not silently re-arm on held-key renewal');
  match.command('a', {seq: 6, type: 'capture', active: false});
  match.command('a', {seq: 7, type: 'capture', active: true});
  for (let i = 0; i < 120; i++) {
    match.step();
    if (i === 59) match.command('a', {seq: 8, type: 'capture', active: true});
  }
  assert.equal(match.score.red, 1, 'a fresh deliberate relay press still completes a normal point');
}

test('an empty-magazine fire attempt cannot preserve relay capture progress', () => {
  const {match, player} = activeRelay();
  player.ammo = 0;
  const beforeReserve = player.reserve;
  assert.deepEqual(match.command('a', {seq: 3, type: 'fire'}),
    {ok: false, reason: 'empty_magazine'});
  assert.equal(player.ammo, 0);
  assert.equal(player.reserve, beforeReserve, 'rejected fire cannot invent rounds');
  assertDisarmed(match, player, 'empty trigger');
});

test('a cooldown-rejected fire attempt cannot keep an occupied relay console active', () => {
  const {match, player} = activeRelay();
  player.lastShotTick = match.ticks;
  const beforeAmmo = player.ammo;
  assert.deepEqual(match.command('a', {seq: 3, type: 'fire'}),
    {ok: false, reason: 'cooldown'});
  assert.equal(player.ammo, beforeAmmo);
  assertDisarmed(match, player, 'cooldown trigger');
});

test('an invalid reload attempt still interrupts the relay without consuming ammunition', () => {
  for (const reason of ['magazine_full', 'no_reserve']) {
    const {match, player} = activeRelay();
    if (reason === 'no_reserve') {player.ammo = 2;player.reserve = 0;}
    const before = [player.ammo, player.reserve];
    assert.deepEqual(match.command('a', {seq: 3, type: 'reload'}),
      {ok: false, reason});
    assert.deepEqual([player.ammo, player.reserve], before);
    assertDisarmed(match, player, reason + ' reload');
  }
});

test('two PC HTTP clients see a server-owned relay interruption after rejected fire', async () => {
  const {createTeamServer} = require('../server/team-server.cjs');
  const server = createTeamServer({port: 0, autoTick: false, now: () => 0});
  const {port} = await server.listen();
  const base = 'http://127.0.0.1:' + port;
  const post = async (path, body, token) => {
    const response = await fetch(base + path, {method: 'POST',
      headers: {'content-type': 'application/json',
        ...(token ? {'x-player-token': token} : {})},
      body: JSON.stringify(body)});
    assert.equal(response.status, path === '/join' ? 201 : 200);
    return response.json();
  };
  try {
    const a = await post('/join', {name: 'A'});
    const b = await post('/join', {name: 'B'});
    await post('/command', {seq: 1, type: 'ready'}, a.token);
    await post('/command', {seq: 1, type: 'ready'}, b.token);
    server.match.players.get(a.token).x = 0;
    await post('/command', {seq: 2, type: 'capture', active: true}, a.token);
    for (let i = 0; i < 60; i++) server.match.step();
    assert.ok(server.match.progress.red > .9);
    server.match.players.get(a.token).ammo = 0;
    assert.deepEqual(await post('/command', {seq: 3, type: 'fire'}, a.token),
      {ok: false, reason: 'empty_magazine'});
    const response = await fetch(base + '/state',
      {headers: {'x-player-token': a.token}});
    assert.equal(response.status, 200);
    const state = await response.json();
    assert.equal(state.progress.red, 0);
    assert.equal(state.self.captureArmed, false);
    assert.equal(state.self.ammo, 0);
  } finally {await server.close();}
});
