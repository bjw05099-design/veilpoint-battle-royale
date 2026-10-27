const test = require('node:test');
const assert = require('node:assert/strict');
const { createClock } = require('../src/clock.js');
const S = require('../src/simulation.js');

function simulate(fps, durationSeconds = 2) {
  const match = S.newMatch(20261027, 3);
  match.status = 'playing';
  const clock = createClock({ hz: 60, maxFrameSeconds: 0.25, maxSteps: 8 });
  for (let frame = 0; frame < fps * durationSeconds; frame++) {
    clock.advance(1 / fps, dt => S.tick(match, dt, { forward: true, right: true }));
  }
  return {
    state: JSON.stringify({ player: match.player, bots: match.bots, elapsed: match.elapsed, zone: match.zone, status: match.status }),
    stats: clock.stats()
  };
}

test('30, 60 and 144 FPS yield identical 60 Hz simulation state', () => {
  const at30 = simulate(30), at60 = simulate(60), at144 = simulate(144);
  assert.equal(at30.state, at60.state);
  assert.equal(at60.state, at144.state);
  assert.equal(at30.stats.totalSteps, 120);
});

test('substep accumulation preserves fractional time', () => {
  const clock = createClock({ hz: 60 });
  const steps = [];
  assert.equal(clock.advance(1 / 120, dt => steps.push(dt)), 0);
  assert.equal(clock.advance(1 / 120, dt => steps.push(dt)), 1);
  assert.equal(steps.length, 1);
  assert.equal(steps[0], 1 / 60);
});

test('long stall has a bounded catch-up and discards backlog', () => {
  const clock = createClock({ hz: 60, maxFrameSeconds: .25, maxSteps: 8 });
  let steps = 0;
  const ran = clock.advance(4, () => steps++);
  assert.equal(steps, 8);
  assert.equal(ran, 8);
  assert.ok(clock.stats().discardedSeconds > 3.8);
  assert.equal(clock.advance(0, () => steps++), 0);
});

test('reset removes partial tick accumulated before a pause', () => {
  const clock = createClock({ hz: 60 });
  const fn = () => {};
  clock.advance(1 / 120, fn);
  clock.reset();
  assert.equal(clock.advance(1 / 120, fn), 0);
});

test('invalid delta is ignored and callback contract is enforced', () => {
  const clock = createClock();
  assert.equal(clock.advance(-10, () => {}), 0);
  assert.equal(clock.advance(NaN, () => {}), 0);
  assert.equal(clock.stats().totalSteps, 0);
  assert.throws(() => clock.advance(1, null), TypeError);
});

test('clock rejects configuration that would prevent predictable updates', () => {
  assert.throws(() => createClock({ hz: 0 }), RangeError);
  assert.throws(() => createClock({ hz: Infinity }), RangeError);
  assert.throws(() => createClock({ maxSteps: 0 }), RangeError);
  assert.throws(() => createClock({ maxFrameSeconds: -1 }), RangeError);
});

test('sequential steps are deterministic independently of frame grouping', () => {
  const a = createClock(), b = createClock();
  const outputA = [], outputB = [];
  for (let i=0;i<60;i++) a.advance(1/60, dt => outputA.push(dt));
  for (let i=0;i<20;i++) b.advance(1/20, dt => outputB.push(dt));
  assert.deepEqual(outputA, outputB);
});
