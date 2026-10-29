'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {TeamMatch, INPUT_LEASE_TICKS, FIRE_INTERVAL_TICKS} = require('../src/team-match.cjs');

function round() {
  const match = new TeamMatch({now: () => 0});
  match.join('a', 'Alpha');match.join('b', 'Bravo');
  match.command('a', {seq: 1, type: 'ready'});
  match.command('b', {seq: 1, type: 'ready'});
  // An off-axis opponent keeps the test about ammunition, not incapacitation.
  match.players.get('b').z = 15;
  return match;
}
test('server-held PC trigger uses finite 60Hz shot cadence and explicit key release', () => {
  const m = round(), p = m.players.get('a');
  assert.deepEqual(m.command('a', {seq: 2, type: 'trigger', active: true}), {ok: true});
  assert.equal(p.ammo, 12, 'intent does not bypass the server tick');
  for (let i = 0; i < 54; i++) m.step();
  assert.equal(p.ammo, 9, 'only ticks 1, 19, 37 may fire');
  assert.equal(p.reserve, 24);
  assert.equal(p.triggerHeld, true);
  m.command('a', {seq: 3, type: 'trigger', active: false});
  for (let i = 0; i < 54; i++) m.step();
  assert.equal(p.ammo, 9, 'keyup immediately stops automatic shots');
});
test('a lost keyup expires at server tick lease; heartbeat cannot renew firing', () => {
  const m = round(), p = m.players.get('a');
  m.command('a', {seq: 2, type: 'trigger', active: true});
  for (let i = 0; i < INPUT_LEASE_TICKS; i++) m.step();
  assert.equal(p.ammo, 7);
  m.command('a', {seq: 3, type: 'heartbeat'});
  for (let i = 0; i < INPUT_LEASE_TICKS; i++) m.step();
  assert.equal(p.triggerHeld, false);
  assert.equal(p.ammo, 7, 'poll/heartbeat must not sustain abandoned trigger');
  assert.equal(p.reserve, 24);
});
test('server rejects spoofed trigger, out-of-round intent and replayed sequences', () => {
  const m = new TeamMatch({now: () => 0});
  m.join('a','Alpha');m.join('b','Bravo');
  assert.throws(() => m.command('a', {seq: 1, type: 'trigger', active: true}), /not_playing/);
  m.command('a', {seq: 1, type: 'ready'});
  m.command('b', {seq: 1, type: 'ready'});
  assert.throws(() => m.command('a', {seq: 2, type: 'trigger', active: 1}), /invalid_trigger/);
  assert.throws(() => m.command('a', {seq: 2, type: 'trigger', active: true, rate: 1000}), /invalid_command/);
  assert.equal(m.command('a', {seq: 2, type: 'trigger', active: true}).ok, true);
  assert.throws(() => m.command('a', {seq: 2, type: 'trigger', active: false}), /invalid_sequence/);
  m.finish('red','test');
  assert.equal(m.players.get('a').triggerHeld, false);
  assert.throws(() => m.command('a', {seq: 3, type: 'trigger', active: true}), /not_playing/);
});
test('held fire shares server-owned ray/cover, ends a round and cannot keep firing afterward', () => {
  const m = round(), a = m.players.get('a'), b = m.players.get('b');
  a.x = 0;a.z = 0;a.facing = {x: 1,z: 0};
  b.x = 5;b.z = 0;
  m.command('a', {seq: 2, type: 'trigger', active: true});
  for (let i = 0; i < FIRE_INTERVAL_TICKS * 3; i++) m.step();
  assert.equal(m.phase, 'ended');
  assert.equal(m.winner, 'red');
  assert.equal(m.reason, 'opponent_incapacitated');
  assert.equal(a.ammo, 9);
  assert.equal(b.health, 0);
  assert.equal(a.triggerHeld, false);
  for (let i = 0; i < 90; i++) m.step();
  assert.equal(a.ammo, 9);
});
