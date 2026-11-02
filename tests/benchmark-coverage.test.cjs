'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createBenchmark}=require('../src/benchmark.js');

test('deadline crossing with a missing final callback interval is only partial evidence',()=>{
 const b=createBenchmark({durationMs:1000,warmupMs:0});
 b.arm({fpsCap:165});b.frame(0,1,1);
 for(let t=100;t<=900;t+=100)b.frame(t,2,1);
 b.frame(1300,2,1); // legal 400ms frame gap, but outside the measurement window
 const r=b.report();
 assert.equal(r.state,'finished');
 assert.equal(r.reason,'measurement-window-incomplete');
 assert.equal(r.completed,false);
 assert.equal(r.measurementStatus,'partial');
 assert.equal(r.measuredPercent,90);
 assert.equal(r.renderedFrameCount,9);
 assert.equal(r.activeMeasuredMs,900);
 assert.equal(b.gpu(3,900),false,'late GPU evidence must not resurrect an incomplete run');
});

test('a short final callback overshoot is tolerated only when coverage is sufficient',()=>{
 const b=createBenchmark({durationMs:1000,warmupMs:0});
 b.arm({fpsCap:60});b.frame(0,1,1);
 for(let t=10;t<=990;t+=10)b.frame(t,1,1);
 b.frame(1005,1,1);
 const r=b.report();
 assert.equal(r.reason,'completed');
 assert.equal(r.completed,true);
 assert.equal(r.activeMeasuredMs,990);
 assert.equal(r.measuredPercent,99);
});

test('120-second run cannot be certified from elapsed wall time with sparse rendering',()=>{
 const b=createBenchmark({durationMs:120000,warmupMs:5000});
 b.arm({fpsCap:165});b.frame(0,1,1);
 // The warmup boundary is sampled; a 500ms final callback gap is not.
 b.frame(5000,1,1);
 for(let t=5100;t<=124500;t+=100)b.frame(t,1,1);
 b.frame(125100,1,1);
 const r=b.report();
 assert.equal(r.reason,'measurement-window-incomplete');
 assert.equal(r.completed,false);
 assert.equal(r.measurementStatus,'partial');
 assert.equal(r.activeMeasuredMs,119500);
 assert.ok(r.measuredPercent<100);
});
