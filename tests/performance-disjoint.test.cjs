'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {createGpuTimer, createTelemetry, createResolutionGovernor} = require('../src/performance.js');

function fakeTimerGL() {
  let next = 0, disjoint = false, available = false, active = null;
  const deleted = [], ended = [];
  const gl = {
    QUERY_RESULT_AVAILABLE: 1, QUERY_RESULT: 2,
    getExtension: () => ({TIME_ELAPSED_EXT: 3, GPU_DISJOINT_EXT: 4}),
    getParameter: () => disjoint,
    createQuery: () => ({id: ++next}),
    beginQuery: (_target, q) => {assert.equal(active, null);active = q;},
    endQuery: () => {assert.ok(active);ended.push(active.id);active = null;},
    getQueryParameter: (_q, type) => type === 1 ? available : 8_000_000,
    deleteQuery: q => deleted.push(q.id)
  };
  return {gl, deleted, ended, setDisjoint: v => {disjoint = v;}, setAvailable: v => {available = v;}};
}

test('GPU disjoint clears stale timing evidence once and pauses new queries until recovery', () => {
  const gpu = fakeTimerGL(), telemetry = createTelemetry(30);
  const governor = createResolutionGovernor({initialScale: 1.25, cooldownMs: 0});
  let invalidations = 0;
  const timer = createGpuTimer(gpu.gl, ms => telemetry.record('gpu', ms), () => {
    invalidations++;
    telemetry.clear();
  });
  assert.equal(timer.begin(), true);timer.end();
  gpu.setAvailable(true);timer.poll();
  assert.equal(telemetry.stats('gpu').count, 1);
  assert.equal(timer.begin(), true);timer.end();
  gpu.setDisjoint(true);timer.poll();timer.poll();
  assert.equal(invalidations, 1, 'one invalidation per continuous disjoint episode');
  assert.deepEqual(gpu.deleted, [1, 2]);
  assert.equal(telemetry.stats('gpu').count, 0, 'old GPU samples must be discarded');
  assert.equal(timer.begin(), false, 'no new GPU queries during a disjoint episode');
  assert.equal(governor.update({nowMs: 2000, gpuP95: telemetry.stats('gpu').p95,
    cpuP95: 2, gpuSamples: 0, cpuSamples: 30}), 1.25);
  gpu.setDisjoint(false);timer.poll();
  assert.equal(timer.begin(), true);timer.end();timer.poll();
  assert.equal(telemetry.stats('gpu').count, 1, 'fresh timings resume after recovery');
  timer.dispose();
});

test('GPU disjoint closes an active query before deleting it and never emits its invalid sample', () => {
  const gpu = fakeTimerGL(), samples = [];
  let invalidations = 0;
  const timer = createGpuTimer(gpu.gl, ms => samples.push(ms), () => invalidations++);
  assert.equal(timer.begin(), true);
  gpu.setDisjoint(true);timer.poll();
  assert.deepEqual(gpu.ended, [1], 'active query must be ended before deletion');
  assert.deepEqual(gpu.deleted, [1]);
  assert.deepEqual(samples, []);
  assert.equal(timer.begin(), false);
  gpu.setDisjoint(false);timer.poll();
  assert.equal(timer.begin(), true);timer.end();
  gpu.setAvailable(true);timer.poll();
  assert.deepEqual(samples, [8]);
  assert.equal(invalidations, 1);
  timer.dispose();
});

test('GPU disjoint resets partial low-load upscale evidence without changing current quality', () => {
  const gpu = fakeTimerGL(), telemetry = createTelemetry(30);
  const governor = createResolutionGovernor({minScale: .7, maxScale: 1.25,
    initialScale: .8, cooldownMs: 0});
  const low = nowMs => ({nowMs, gpuP95: 2, cpuP95: 2, gpuSamples: 60, cpuSamples: 60});
  const timer = createGpuTimer(gpu.gl, ms => telemetry.record('gpu', ms), () => {
    telemetry.clear();
    governor.resetEvidence();
  });
  assert.equal(governor.update(low(0)), .8);
  assert.equal(governor.update(low(1000)), .8);
  timer.begin();timer.end();gpu.setDisjoint(true);timer.poll();
  assert.equal(governor.getScale(), .8, 'disjoint must not change selected resolution');
  gpu.setDisjoint(false);timer.poll();
  assert.equal(governor.update(low(2000)), .8);
  assert.equal(governor.update(low(3000)), .8);
  assert.equal(governor.update(low(4000)), .9, 'three fresh windows required after disjoint');
  timer.dispose();
});

test('missing or invalid GPU timing breaks consecutive low-load evidence', () => {
  const governor = createResolutionGovernor({minScale: .7, maxScale: 1.25,
    initialScale: .8, cooldownMs: 0});
  const low = nowMs => ({nowMs, gpuP95: 2, cpuP95: 2, gpuSamples: 60, cpuSamples: 60});
  governor.update(low(0));governor.update(low(1000));
  assert.equal(governor.update({...low(2000), gpuSamples: 0}), .8);
  assert.equal(governor.update(low(3000)), .8);
  assert.equal(governor.update(low(4000)), .8);
  assert.equal(governor.update(low(5000)), .9);
});

test('timing evidence reset preserves adaptive cooldown and quality bounds', () => {
  const governor = createResolutionGovernor({minScale: .7, maxScale: 1,
    initialScale: 1, cooldownMs: 2500});
  const high = nowMs => ({nowMs, gpuP95: 12, cpuP95: 2, gpuSamples: 60, cpuSamples: 60});
  assert.equal(governor.update(high(0)), .9);
  governor.resetEvidence();
  assert.equal(governor.update(high(1000)), .9);
  assert.equal(governor.update(high(2500)), .8);
});
