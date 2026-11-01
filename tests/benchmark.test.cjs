'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createBenchmark}=require('../src/benchmark.js');

test('starts only at an actual rendered frame and ignores warmup',()=>{
 const b=createBenchmark({durationMs:1000,warmupMs:200});
 b.arm({fpsCap:60,preset:'balanced'});
 assert.equal(b.getStatus().state,'armed');
 b.frame(0,1,1);
 for(let t=100;t<=1200;t+=100)b.frame(t,2,1);
 const r=b.report();
 assert.equal(r.state,'finished');assert.equal(r.reason,'completed');
 assert.equal(r.renderedFrameCount,10);
 assert.equal(r.observedFps,10);
 assert.equal(r.estimatedOnePercentLowFps,10);
 assert.equal(r.cpuRendererDrawMs.count,11);
 assert.equal(r.webglGpuTimerMs.count,0);
 assert.equal(r.settings.fpsCap,60);
 assert.equal(r.gpuTimerInvalidated,false);
});

test('interrupted or invalid timings never invent a completed benchmark',()=>{
 const b=createBenchmark({durationMs:5000,warmupMs:0});
 b.arm({fpsCap:165});b.frame(100,1,1);b.frame(110,2,1);
 b.frame(1500,2,1);
 assert.equal(b.report().reason,'render-gap-or-invalid-clock');
 assert.equal(b.report().renderedFrameCount,1);
 b.arm({fpsCap:60});assert.equal(b.report().renderedFrameCount,0);
 b.finish('manual');assert.equal(b.report().observedFps,null);
 assert.equal(b.report().estimatedOnePercentLowFps,null);
});

test('WebGL disjoint invalidates GPU timings and keeps CPU/interval evidence',()=>{
 const b=createBenchmark({durationMs:1500,warmupMs:0});
 b.arm({fpsCap:60});b.frame(0,1,1);b.frame(100,2,.9);
 assert.equal(b.gpu(3),true);assert.equal(b.report().webglGpuTimerMs.count,1);
 b.invalidateGpu();assert.equal(b.gpu(4),false);
 b.frame(200,2,.8);b.finish('manual');
 assert.equal(b.report().webglGpuTimerMs.count,0);
 assert.equal(b.report().gpuTimerInvalidated,true);
 assert.deepEqual(b.report().effectiveRenderScale,{min:.8,max:.9});
});

test('rejects invalid configuration and never exceeds bounded sample limit',()=>{
 assert.throws(()=>createBenchmark({durationMs:100}),RangeError);
 assert.throws(()=>createBenchmark({warmupMs:-1}),RangeError);
 const b=createBenchmark({durationMs:300000,warmupMs:0});
 b.arm({fpsCap:60});b.frame(0,1,1);
 for(let t=1;t<=30001;t++)b.frame(t,1,1);
 assert.equal(b.report().reason,'sample-limit');
 assert.equal(b.report().renderedFrameCount,30000);
 assert.equal(b.report().activeMeasuredMs,30000);
});
