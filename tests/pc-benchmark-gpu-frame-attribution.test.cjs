'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createBenchmark}=require('../src/benchmark.js');

test('PC WebGL query callbacks are one-per-issued-frame even after measurement completes',()=>{
 const b=createBenchmark({durationMs:1000,warmupMs:100});
 b.arm({fpsCap:165});
 for(const time of [0,100,200,400,700,1100])b.frame(time,2,1,{width:2560,height:1440});
 assert.equal(b.report().completed,true);
 assert.equal(b.gpu(4,200),true,'valid asynchronous result for actual measured frame');
 assert.equal(b.gpu(400,200),false,'repeated query callback cannot multiply P95 influence');
 assert.equal(b.gpu(3,400),true);
 assert.equal(b.gpu(200,400),false);
 assert.equal(b.report().webglGpuTimerMs.count,2);
 assert.equal(b.report().webglGpuTimerMs.p95,3.95);
 assert.match(b.report().gpuTimerSampleNote,/one valid result/);
 assert.equal(b.report().canvasBackingPixels.minWidth,2560);
 assert.equal(b.report().canvasBackingPixels.minHeight,1440);
});
test('PC rearmed benchmark can accept legitimate new draw timestamps, but no stale timing evidence',()=>{
 const b=createBenchmark({durationMs:1000,warmupMs:0});
 b.arm({fpsCap:60});b.frame(0,1,1);b.frame(100,1,1);
 assert.equal(b.gpu(5,100),true);
 assert.equal(b.gpu(7,100),false,'duplicate issuedAt must not add an extra GPU frame');
 b.finish('manual');
 assert.equal(b.gpu(2,100),false,'interrupted run cannot be revived');
 b.arm({fpsCap:165});
 b.frame(2000,1,1);b.frame(2100,1,1);
 assert.equal(b.gpu(8,100),false,'old benchmark sample lies outside new window');
 assert.equal(b.gpu(6,2100),true,'new frame timestamp may be accepted');
 assert.equal(b.gpu(1,2100),false);
 assert.equal(b.report().webglGpuTimerMs.count,1);
 b.invalidateGpu();
 assert.equal(b.report().webglGpuTimerMs.count,0,'disjoint invalidation retains precedence');
});
