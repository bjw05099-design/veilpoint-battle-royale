'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {createFixedStepClock} = require('../server/team-server.cjs');

test('monotonic server clock advances exactly 60 authoritative steps per second', () => {
  let ticks = 0;
  const advance = createFixedStepClock(() => ticks++);
  assert.equal(advance(0), 0);
  for (let ms = 10; ms <= 1000; ms += 10) advance(ms);
  assert.equal(ticks, 60, '16ms integer interval would incorrectly run ~62.5Hz');
  assert.equal(advance(1000), 0, 'same instant cannot run a second tick');
  for (let ms = 1010; ms <= 2000; ms += 10) advance(ms);
  assert.equal(ticks, 120, 'no cumulative fractional frame drift');
});

test('irregular event-loop wakeups preserve deterministic elapsed-time tick count', () => {
  const sampleTimes = [0, 1, 8, 19, 41, 55, 73, 90, 117, 160, 202,
    251, 300, 333, 360, 410, 450, 500, 545, 600, 650, 700, 750,
    800, 850, 900, 950, 1000];
  const replay = () => {
    let count = 0;
    const advance = createFixedStepClock(() => count++);
    const steps = sampleTimes.map(t => advance(t));
    assert.equal(count, 60);
    return steps;
  };
  assert.deepEqual(replay(), replay());
});

test('long process stall drops stale backlog instead of bursting invisible combat', () => {
  let count = 0;
  const advance = createFixedStepClock(() => count++);
  advance(0);
  assert.equal(advance(2000), 5, 'catch-up is bounded per wakeup');
  assert.equal(count, 5);
  assert.equal(advance(2000), 0, 'stale backlog cannot replay without elapsed time');
  assert.equal(advance(NaN), 0, 'invalid clock samples are ignored');
  assert.equal(advance(2010), 0);
  assert.equal(advance(2020), 1);
  assert.equal(count, 6);
});

test('clock rollback cannot create phantom elapsed ticks', () => {
  let count = 0;
  const advance = createFixedStepClock(() => count++);
  advance(100);
  assert.equal(advance(90), 0);
  assert.equal(advance(90), 0);
  assert.equal(advance(100), 0);
  assert.equal(advance(110), 0, 'recovery past a rollback must not double-count ten milliseconds');
  assert.equal(count, 0);
  assert.equal(advance(116.667), 1);
  assert.equal(count, 1);
  assert.equal(advance(115), 0, 'later jitter must not rewind the high-water mark');
  assert.equal(advance(120), 0);
  assert.equal(count, 1);
});

test('clock jitter and a long stall do not create phantom catch-up steps', () => {
  let ticks = 0;
  const advance = createFixedStepClock(() => ticks++);
  advance(1000);
  assert.equal(advance(999), 0);
  assert.equal(advance(1005), 0);
  assert.equal(advance(1010), 0);
  assert.equal(advance(1017), 1);
  assert.equal(ticks, 1);
  assert.equal(advance(3017), 5, 'real long stalls remain bounded');
  assert.equal(advance(3010), 0);
  assert.equal(advance(3017), 0);
  assert.equal(ticks, 6);
});

test('five-tick catch-up preserves fractional time for the next short wakeup', () => {
  const replay = () => {
    let ticks = 0;
    const advance = createFixedStepClock(() => ticks++);
    advance(0);
    const perWakeup = [];
    // Each 90ms wakeup legitimately executes five steps and leaves 6.67ms;
    // the following 10ms must finish the sixth step. Old code discarded the
    // fraction on every five-step wakeup, slowing a one-second round to 50 ticks.
    for (let i = 0; i < 10; i++) {
      perWakeup.push(advance(i * 100 + 90));
      perWakeup.push(advance((i + 1) * 100));
    }
    assert.equal(ticks, 60, 'the 60Hz server must not lose elapsed fractional time');
    assert.deepEqual(perWakeup, Array.from({length: 10}, () => [5, 1]).flat());
    return perWakeup;
  };
  assert.deepEqual(replay(), replay(), 'identical wakeups must be deterministic');
});

test('six or more overdue ticks still discard the stale backlog safely', () => {
  let ticks = 0;
  const advance = createFixedStepClock(() => ticks++);
  advance(0);
  assert.equal(advance(100), 5, '100ms requires six ticks but burst is capped at five');
  assert.equal(advance(110), 0, 'the overdue sixth tick must not leak into later input');
  assert.equal(advance(120), 1, 'new elapsed time still advances the simulation');
  assert.equal(ticks, 6);
});
