'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {TeamMatch, FIRE_INTERVAL_TICKS} = require('../src/team-match.cjs');

function duel(reverseJoinOrder = false) {
  const m = new TeamMatch({now: () => 0});
  m.join('a', 'A');m.join('b', 'B');
  m.command('a', {seq: 1, type: 'ready'});
  m.command('b', {seq: 1, type: 'ready'});
  const a = m.players.get('a'), b = m.players.get('b');
  a.x = -3;a.z = 0;a.facing = {x: 1, z: 0};
  b.x = 3;b.z = 0;b.facing = {x: -1, z: 0};
  if (reverseJoinOrder) {
    // Exercise both iteration orders without changing either player's team.
    m.players.delete('a');m.players.set('a', a);
  }
  m.command('a', {seq: 2, type: 'trigger', active: true});
  m.command('b', {seq: 2, type: 'trigger', active: true});
  return {m, a, b};
}

test('two held triggers resolve mutual final hits without join-order advantage', () => {
  for (const reverse of [false, true]) {
    const {m, a, b} = duel(reverse);
    a.health = 34;b.health = 34;
    m.step();
    assert.deepEqual([a.health, b.health, a.ammo, b.ammo], [0, 0, 11, 11]);
    assert.equal(m.phase, 'ended');
    assert.equal(m.winner, null, 'simultaneous incapacitation is a draw');
    assert.equal(m.reason, 'mutual_incapacitation');
    assert.equal(a.triggerHeld, false);
    assert.equal(b.triggerHeld, false);
    for (let i = 0; i < FIRE_INTERVAL_TICKS * 2; i++) m.step();
    assert.deepEqual([a.ammo, b.ammo], [11, 11], 'no shots after a draw');
  }
});

test('both nonlethal held hits apply before the next 60Hz tick', () => {
  const {m, a, b} = duel();
  m.step();
  assert.deepEqual([a.health, b.health], [66, 66]);
  assert.deepEqual([a.ammo, b.ammo], [11, 11]);
  assert.equal(m.phase, 'playing');
  assert.equal(a.stress, b.stress);
});

test('unilateral held hit still awards the surviving team and no phantom shot', () => {
  const {m, a, b} = duel(true);
  a.health = 34;b.health = 34;
  b.facing = {x: 1, z: 0}; // Opponent is behind B; no automatic aim.
  m.step();
  assert.equal(m.phase, 'ended');
  assert.equal(m.winner, 'red');
  assert.equal(m.reason, 'opponent_incapacitated');
  assert.deepEqual([a.health, b.health, a.ammo, b.ammo], [34, 0, 11, 11]);
});

test('draw can be replayed with finite fresh-round inventory and cleared trigger', () => {
  const {m, a, b} = duel();
  a.health = 34;b.health = 34;
  m.step();
  m.command('a', {seq: 3, type: 'ready'});
  m.command('b', {seq: 3, type: 'ready'});
  assert.equal(m.phase, 'playing');
  assert.equal(m.winner, null);
  assert.equal(m.reason, null);
  assert.deepEqual([a.health, b.health, a.ammo, b.ammo], [100, 100, 12, 12]);
  m.step();
  assert.deepEqual([a.ammo, b.ammo], [12, 12], 'old held trigger cannot leak into rematch');
});

test('same-tick held-fire outcome is deterministic across identical replays', () => {
  const run = () => {
    const {m, a, b} = duel();
    a.health = 34;b.health = 34;
    m.step();
    return [m.snapshot('a'), m.snapshot('b')];
  };
  assert.deepEqual(run(), run());
});
