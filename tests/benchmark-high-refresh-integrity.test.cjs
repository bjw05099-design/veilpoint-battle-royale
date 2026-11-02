'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createBenchmark}=require('../src/benchmark.js');

test('a completed run retains asynchronously resolved GPU samples from its measured frames',()=>{
 const b=createBenchmark({durationMs:1000,warmupMs:100});
 b.arm({fpsCap:165});
 b.frame(0,1,1);
 b.frame(200,2,1);
 b.frame(500,3,1);
 b.frame(1000,4,1);
 b.frame(1100,5,1); // completes the run before WebGL query results arrive
 assert.equal(b.getStatus().state,'finished');
 assert.equal(b.report().reason,'completed');
 const frameCount=b.report().renderedFrameCount;
 const measuredMs=b.report().activeMeasuredMs;
 assert.equal(b.gpu(4.5,500),true);
 assert.equal(b.gpu(3.5,1100),true);
 assert.equal(b.gpu(9,99),false,'warmup GPU query cannot enter a completed report');
 assert.equal(b.gpu(9,1101),false,'post-window query cannot enter a completed report');
 assert.equal(b.gpu(9,NaN),false,'unknown query provenance cannot enter a completed report');
 assert.equal(b.report().webglGpuTimerMs.count,2);
 assert.equal(b.report().renderedFrameCount,frameCount);
 assert.equal(b.report().activeMeasuredMs,measuredMs);
 b.invalidateGpu();
 assert.equal(b.gpu(4,500),false,'disjoint invalidation still takes precedence');
 assert.equal(b.report().webglGpuTimerMs.count,0);
});

test('interrupted benchmarks cannot be resurrected by delayed GPU queries',()=>{
 for(const why of ['manual','graphics-settings-changed','graphics-context-lost','render-gap-or-invalid-clock']){
  const b=createBenchmark({durationMs:1000,warmupMs:0});
  b.arm({fpsCap:165});
  b.frame(0,1,1);
  b.frame(100,1,1);
  b.finish(why);
  assert.equal(b.gpu(5,100),false,why);
  assert.equal(b.report().webglGpuTimerMs.count,0);
 }
});

test('stutter detection uses two frame budgets at 165Hz rather than a 50ms floor',()=>{
 const run=cap=>{
  const b=createBenchmark({durationMs:1000,warmupMs:0});
  b.arm({fpsCap:cap});
  b.frame(0,1,1);
  for(const t of [16,22,38,44])b.frame(t,1,1);
  return b.report();
 };
 const fast=run(165),normal=run(60),unknown=run(0);
 assert.ok(Math.abs(fast.stutterThresholdMs-2000/165)<1e-9);
 assert.equal(fast.stutterIntervals,2,'16ms callbacks miss more than two 165FPS budgets');
 assert.ok(Math.abs(normal.stutterThresholdMs-2000/60)<1e-9);
 assert.equal(normal.stutterIntervals,0,'the same callbacks are not stalls at 60FPS');
 assert.equal(unknown.stutterThresholdMs,50,'invalid caps use the documented fallback');
 assert.equal(unknown.stutterIntervals,0);
 assert.match(fast.stutterMethod,/callback interval/);
 assert.match(fast.gpuTimerSampleNote,/asynchronous/);
});
