'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {createTelemetry, createResolutionGovernor, percentile} = require('../src/performance.js');

test('large CPU/GPU/RAF telemetry windows retain exactly the newest samples across repeated wraparound', () => {
  const size = 10000;
  const telemetry = createTelemetry(size);
  const samples = Array.from({length: 24037}, (_, i) => 1 + ((i * 37) % 251) / 10);
  for (const value of samples) {
    assert.equal(telemetry.record('gpu', value), true);
    telemetry.record('cpu', value / 2);
  }
  const expected = samples.slice(-size);
  const gpu = telemetry.stats('gpu');
  const cpu = telemetry.stats('cpu');
  assert.equal(gpu.count, size);
  assert.equal(cpu.count, size);
  for (const [key, quantile] of [['p50', .5], ['p95', .95], ['p99', .99]]) {
    assert.equal(gpu[key], percentile(expected, quantile));
    assert.equal(cpu[key], percentile(expected.map(value => value / 2), quantile));
  }
  assert.equal(telemetry.stats('raf').count, 0);
  telemetry.clear();
  assert.equal(telemetry.stats('gpu').p95, null);
  for (let i = 1; i <= size + 1; i++) telemetry.record('gpu', i / 2);
  assert.equal(telemetry.stats('gpu').p50, (size + 3) / 4);
  assert.equal(telemetry.stats('gpu').p99, percentile(Array.from({length: size}, (_, i) => (i + 2) / 2), .99));
});

test('invalid GPU or CPU sample counts never authorize adaptive quality changes', () => {
  const governor = createResolutionGovernor({minScale: .7, maxScale: 1.25,
    initialScale: 1.25, cooldownMs: 0});
  const invalidCounts = [NaN, Infinity, -Infinity, 29.9, 30.5, -1, 0, '60', null];
  let nowMs = 0;
  for (const count of invalidCounts) {
    const sample = {nowMs: ++nowMs, gpuP95: 15, cpuP95: 2,
      gpuSamples: 60, cpuSamples: 60};
    assert.equal(governor.update({...sample, gpuSamples: count}), 1.25);
    assert.equal(governor.update({...sample, nowMs: ++nowMs, cpuSamples: count}), 1.25);
  }
  assert.equal(governor.update({nowMs: ++nowMs, gpuP95: 15, cpuP95: 2,
    gpuSamples: 60, cpuSamples: 60}), 1.1,
    'genuine measured CPU/GPU windows still permit a bounded step-down');
});

test('duplicate or backward timing windows cannot be counted as fresh upscale evidence', () => {
  const governor = createResolutionGovernor({minScale: .7, maxScale: 1.25,
    initialScale: .8, cooldownMs: 0});
  const low = nowMs => ({nowMs, gpuP95: 2, cpuP95: 2,
    gpuSamples: 60, cpuSamples: 60});
  assert.equal(governor.update(low(1000)), .8);
  assert.equal(governor.update(low(2000)), .8);
  assert.equal(governor.update(low(2000)), .8, 'same window must reset consecutive evidence');
  assert.equal(governor.update(low(1999)), .8, 'older window must not count');
  assert.equal(governor.update(low(3000)), .8);
  assert.equal(governor.update(low(4000)), .8);
  assert.equal(governor.update(low(5000)), .9, 'only three fresh consecutive windows upscale');
});
