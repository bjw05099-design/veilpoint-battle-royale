'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { FPS_OPTIONS, createFrameLimiter } = require('../src/fps.js');

function simulate(cap, refresh, durationMs=12000) {
  const limiter = createFrameLimiter(cap);
  let count = 0;
  const step = 1000 / refresh;
  for (let i = 0; i <= Math.floor(durationMs / step); i++) {
    if (limiter.shouldRender(i * step)) count++;
  }
  return { count, measuredFps: (count - 1) * 1000 / durationMs, ...limiter.stats() };
}

test('165 Hz target is available with lower FPS caps', () => {
  assert.deepEqual(FPS_OPTIONS, [30,60,90,120,144,165]);
  assert.equal(createFrameLimiter(165).stats().cap, 165);
});

test('render limiter reaches 165 FPS pacing when called at 165 Hz', () => {
  const run = simulate(165, 165);
  assert.ok(run.measuredFps >= 164 && run.measuredFps <= 165.5, JSON.stringify(run));
});

test('render limiter honors 60 FPS selection on 165 Hz display', () => {
  const run = simulate(60,165);
  assert.ok(run.measuredFps >= 55 && run.measuredFps <= 60.5, JSON.stringify(run));
});

test('165 FPS cap does not render faster on 240 Hz display', () => {
  const run = simulate(165,240);
  assert.ok(run.measuredFps >= 153 && run.measuredFps <= 165.5, JSON.stringify(run));
});

test('cannot exceed monitor callback frequency', () => {
  const run = simulate(165,60);
  assert.ok(run.measuredFps <= 60.1, JSON.stringify(run));
});

test('invalid caps are rejected and settings changes reset pacing', () => {
  const fps = createFrameLimiter(60);
  assert.throws(() => createFrameLimiter(240), RangeError);
  assert.throws(() => fps.setLimit(0), RangeError);
  fps.shouldRender(0); fps.shouldRender(17);
  fps.setLimit(165);
  assert.equal(fps.stats().cap, 165);
  assert.equal(fps.stats().actualFps, 0);
  assert.equal(fps.shouldRender(20), true);
  assert.equal(fps.shouldRender(NaN), false);
});

test('after a long background stall rendering resumes without catchup bursts', () => {
  const fps = createFrameLimiter(165);
  assert.equal(fps.shouldRender(0),true);
  assert.equal(fps.shouldRender(100000),true);
  assert.equal(fps.shouldRender(100001),false);
  assert.equal(fps.shouldRender(100007),true);
});
