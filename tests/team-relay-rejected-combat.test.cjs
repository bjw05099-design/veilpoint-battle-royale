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
