'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {createClock} = require('../src/clock.js');

test('repeated finite extreme frame gaps cannot overflow discarded time or replay input', () => {
  const clock = createClock();
  let ticks = 0;
  assert.equal(clock.advance(1e308, () => { ticks++; }), 8);
  assert.equal(clock.advance(1e308, () => { ticks++; }), 8);
  assert.equal(ticks, 16);
  const stats = clock.stats();
  assert.equal(stats.discardedSeconds, Number.MAX_VALUE);
  assert.ok(Number.isFinite(stats.alpha) && stats.alpha >= 0 && stats.alpha < 1);
  assert.equal(stats.totalSteps, 16);
});

test('ordinary fixed-step simulation and discarded duration remain exact', () => {
  const clock = createClock({hz: 60, maxSteps: 8});
  let ticks = 0;
  clock.advance(0.5, () => { ticks++; });
  assert.equal(ticks, 8);
  assert.ok(Math.abs(clock.stats().discardedSeconds - (0.25 + (0.25 - 8/60 - (0.25 - 8/60) % (1/60)))) < 1e-8);
});
