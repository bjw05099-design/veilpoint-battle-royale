'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {TeamMatch, CAPTURE_SECONDS, STEP} = require('../src/team-match.cjs');

function round() {
  const match = new TeamMatch({now: () => 0});
  match.join('a', 'Alpha');
  match.join('b', 'Bravo');
  match.command('a', {seq: 1, type: 'ready'});
  match.command('b', {seq: 1, type: 'ready'});
  const player = match.players.get('a');
  player.x = 0;
  player.z = 0;
  match.players.get('b').x = 8;
  return {match, player};
}

test('moving through a relay cannot bank a capture; stopping starts a full 60Hz interaction', () => {
  const {match: m, player} = round();
  m.command('a', {seq: 2, type: 'move', direction: {x: 1, z: 0}});
  m.command('a', {seq: 3, type: 'capture', active: true});
  for (let i = 0; i < 20; i++) m.step();
  assert.ok(Math.hypot(player.x, player.z) < 2.6, 'operator remains inside the objective');
  assert.equal(m.progress.red, 0, 'moving inside the ring must not earn partial points');
  m.command('a', {seq: 4, type: 'move', direction: {x: 0, z: 0}});
  for (let i = 0; i < CAPTURE_SECONDS / STEP; i++) {
    m.step();
    if (i === 59) m.command('a', {seq: 5, type: 'capture', active: true});
  }
  assert.equal(m.score.red, 1, 'stationary, uninterrupted interaction still works');
});

test('reloading cannot operate the relay until the finite reload completes', () => {
  const {match: m, player} = round();
  player.ammo = 3;
  m.command('a', {seq: 2, type: 'reload'});
  m.command('a', {seq: 3, type: 'capture', active: true});
  for (let i = 0; i < 60; i++) m.step();
  assert.equal(m.progress.red, 0);
  assert.equal(player.reloadTicks, 30);
  m.command('a', {seq: 4, type: 'capture', active: true});
  for (let i = 0; i < 30; i++) m.step();
  assert.equal(player.reloadTicks, 0);
  assert.ok(m.progress.red <= STEP + 1e-8, 'reload completion cannot grant prior progress');
  for (let i = 0; i < 120; i++) {
    m.step();
    if (i === 59) m.command('a', {seq: 5, type: 'capture', active: true});
  }
  assert.equal(m.score.red, 1);
  assert.equal(player.ammo, 12);
  assert.equal(player.reserve, 15, 'reload conserves carried rounds');
});

test('holding an empty trigger cannot capture and cannot generate ammunition', () => {
  const {match: m, player} = round();
  player.ammo = 0;
  m.command('a', {seq: 2, type: 'trigger', active: true});
  m.command('a', {seq: 3, type: 'capture', active: true});
  for (let i = 0; i < 60; i++) m.step();
  assert.equal(m.progress.red, 0);
  assert.equal(player.ammo, 0);
  assert.equal(player.reserve, 24);
  m.command('a', {seq: 4, type: 'trigger', active: false});
  m.command('a', {seq: 5, type: 'capture', active: true});
  for (let i = 0; i < 120; i++) {
    m.step();
    if (i === 59) m.command('a', {seq: 6, type: 'capture', active: true});
  }
  assert.equal(m.score.red, 1);
  assert.equal(player.ammo, 0);
});
