'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createBenchmark}=require('../src/benchmark.js');
const {createGpuTimer}=require('../src/performance.js');

test('late GPU query from an earlier run cannot contaminate a newly armed benchmark',()=>{
  const b=createBenchmark({durationMs:1000,warmupMs:100});
  b.arm({fpsCap:60});b.frame(0,1,1);b.frame(200,1,1);
  assert.equal(b.gpu(9,150),true);
  b.finish('manual');
  b.arm({fpsCap:60});b.frame(1000,1,1);b.frame(1200,1,1);
  assert.equal(b.gpu(9,150),false,'old run query must be excluded');
  assert.equal(b.gpu(9,1099),false,'pre-warmup query must be excluded');
  assert.equal(b.gpu(9,1100),true,'in-window query is measured');
  assert.equal(b.gpu(9,2101),false,'query after the measurement window is excluded');
  assert.equal(b.gpu(9,NaN),false,'unknown query provenance is not evidence');
  assert.equal(b.gpu(9),false,'untagged GPU timing is not evidence');
  assert.equal(b.report().webglGpuTimerMs.count,1);
});

test('asynchronous WebGL timer retains each original draw timestamp across polling',()=>{
  let next=0,ready=false;
  const ext={TIME_ELAPSED_EXT:3,GPU_DISJOINT_EXT:4};
  const gl={QUERY_RESULT_AVAILABLE:1,QUERY_RESULT:2,
    getExtension:()=>ext,getParameter:()=>false,createQuery:()=>({id:++next}),
    beginQuery:()=>{},endQuery:()=>{},deleteQuery:()=>{},
    getQueryParameter:(_q,p)=>p===1?ready:5_000_000};
  const observed=[];
  const timer=createGpuTimer(gl,(ms,issuedAt)=>observed.push([ms,issuedAt]));
  assert.equal(timer.begin(150),true);timer.end();
  assert.equal(timer.begin(260),true);timer.end();
  timer.poll();assert.deepEqual(observed,[]);
  ready=true;timer.poll();
  assert.deepEqual(observed,[[5,150],[5,260]]);
  timer.dispose();
});
