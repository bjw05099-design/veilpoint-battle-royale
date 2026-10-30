'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {TeamMatch, CAPTURE_SECONDS, STEP} = require('../src/team-match.cjs');

function match() {
  const m = new TeamMatch({now: () => 0});
  m.join('a', 'A');m.join('b', 'B');
  m.command('a', {seq: 1, type: 'ready'});
  m.command('b', {seq: 1, type: 'ready'});
  return m;
}
function ticks(m, count) {for (let i = 0; i < count; i++) m.step();}

test('remote capture press cannot bank a future point after walking into range', () => {
  const m = match(), a = m.players.get('a');
  m.command('a', {seq: 2, type: 'capture', active: true}); // Spawn is 8m away.
  assert.equal(a.captureArmed, false);
  m.command('a', {seq: 3, type: 'move', direction: {x: 1, z: 0}});
  ticks(m, 60);
  m.command('a', {seq: 4, type: 'move', direction: {x: 1, z: 0}});
  m.command('a', {seq: 5, type: 'capture', active: true});
  ticks(m, 47);
  m.command('a', {seq: 6, type: 'move', direction: {x: 0, z: 0}});
  assert.ok(Math.hypot(a.x, a.z) < 2.6);
  for (let i = 0; i < 120; i++) {
    m.step();
    if (i === 59) m.command('a', {seq: 7, type: 'capture', active: true});
  }
  assert.equal(m.score.red, 0);
  assert.equal(m.progress.red, 0);
  m.command('a', {seq: 8, type: 'capture', active: false});
  m.command('a', {seq: 9, type: 'capture', active: true});
  assert.equal(a.captureArmed, true);
  for (let i = 0; i < CAPTURE_SECONDS / STEP; i++) {
    m.step();
    if (i === 59) m.command('a', {seq: 10, type: 'capture', active: true});
  }
  assert.equal(m.score.red, 1);
});

test('leaving relay radius disarms held interaction; returning requires fresh press', () => {
  const m = match(), a = m.players.get('a');
  a.x = 0;a.z = 0;
  m.command('a', {seq: 2, type: 'capture', active: true});
  ticks(m, 60);
  assert.ok(m.progress.red > 0);
  m.command('a', {seq: 3, type: 'move', direction: {x: 1, z: 0}});
  ticks(m, 45);
  assert.ok(a.x > 2.6);
  assert.equal(a.captureArmed, false);
  assert.equal(m.progress.red, 0);
  m.command('a', {seq: 4, type: 'move', direction: {x: -1, z: 0}});
  ticks(m, 45);
  m.command('a', {seq: 5, type: 'move', direction: {x: 0, z: 0}});
  assert.ok(Math.hypot(a.x, a.z) < 2.6);
  m.command('a', {seq: 6, type: 'capture', active: true});
  ticks(m, 60);
  assert.equal(m.progress.red, 0);
  m.command('a', {seq: 7, type: 'capture', active: false});
  m.command('a', {seq: 8, type: 'capture', active: true});
  for (let i = 0; i < 120; i++) {
    m.step();
    if (i === 59) m.command('a', {seq: 9, type: 'capture', active: true});
  }
  assert.equal(m.score.red, 1);
});
