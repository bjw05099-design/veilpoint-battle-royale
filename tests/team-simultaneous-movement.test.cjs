'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {TeamMatch, STEP, SPEED} = require('../src/team-match.cjs');

const BODY_DIAMETER = 1.1; // Two 0.55-unit actor collision radii.
function round(reverseOrder = false) {
  const m = new TeamMatch({now: () => 0});
  m.join('a', 'A');
  m.join('b', 'B');
  m.command('a', {seq: 1, type: 'ready'});
  m.command('b', {seq: 1, type: 'ready'});
  const a = m.players.get('a'), b = m.players.get('b');
  a.x = -0.58; a.z = 0;
  b.x = 0.58; b.z = 0;
  if (reverseOrder) {
    m.players.delete('a');
    m.players.set('a', a);
  }
  return {m, a, b};
}
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

test('head-on movement at the same 60Hz tick shares collision clearance fairly', () => {
  const run = reverse => {
    const {m, a, b} = round(reverse);
    m.command('a', {seq: 2, type: 'move', direction: {x: 1, z: 0}});
    m.command('b', {seq: 2, type: 'move', direction: {x: -1, z: 0}});
    m.step();
    assert.ok(distance(a, b) >= BODY_DIAMETER - 1e-8, 'no actor overlap');
    assert.ok(a.x > -0.58 && b.x < 0.58, 'both move until contact');
    assert.ok(Math.abs((a.x + 0.58) - (0.58 - b.x)) < 1e-9,
      'same-tick movement cannot favour the first player');
    return [a.x, b.x, m.ticks];
  };
  assert.deepEqual(run(false), run(true), 'reversing Map order cannot change the result');
  assert.deepEqual(run(false), run(false), '60Hz replay remains deterministic');
});

test('stationary actor is not displaced when another actor approaches', () => {
  const {m, a, b} = round();
  m.command('a', {seq: 2, type: 'move', direction: {x: 1, z: 0}});
  m.step();
  assert.equal(b.x, 0.58);
  assert.ok(a.x > -0.58);
  assert.ok(distance(a, b) >= BODY_DIAMETER - 1e-8);
});

test('parallel movement preserves speed without unnecessary collision slowdown', () => {
  const {m, a, b} = round();
  m.command('a', {seq: 2, type: 'move', direction: {x: 1, z: 0}});
  m.command('b', {seq: 2, type: 'move', direction: {x: 1, z: 0}});
  m.step();
  assert.ok(Math.abs(a.x - (-0.58 + SPEED * STEP)) < 1e-10);
  assert.ok(Math.abs(b.x - (0.58 + SPEED * STEP)) < 1e-10);
  assert.ok(distance(a, b) >= BODY_DIAMETER);
});

test('pre-existing overlap can separate but cannot be made deeper', () => {
  const outward = round();
  outward.a.x = -0.2;
  outward.b.x = 0.2;
  outward.m.command('a', {seq: 2, type: 'move', direction: {x: -1, z: 0}});
  outward.m.command('b', {seq: 2, type: 'move', direction: {x: 1, z: 0}});
  outward.m.step();
  assert.ok(distance(outward.a, outward.b) > 0.4);

  const inward = round(true);
  inward.a.x = -0.2;
  inward.b.x = 0.2;
  inward.m.command('a', {seq: 2, type: 'move', direction: {x: 1, z: 0}});
  inward.m.command('b', {seq: 2, type: 'move', direction: {x: -1, z: 0}});
  inward.m.step();
  assert.deepEqual([inward.a.x, inward.b.x], [-0.2, 0.2],
    'an invalid overlap cannot be exploited for further penetration');
});
