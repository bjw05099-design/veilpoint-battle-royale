'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {percentile,createTelemetry,createGpuTimer,createResolutionGovernor,TARGET_FRAME_MS}=require('../src/performance.js');
test('percentiles are interpolated and empty sets are explicitly unmeasured',()=>{
 assert.equal(percentile([],.95),null);
 assert.equal(percentile([5,1,3,2,4],.5),3);
 assert.ok(Math.abs(percentile([1,2,3,4,5],.95)-4.8)<1e-10);
 assert.ok(Math.abs(TARGET_FRAME_MS-1000/165)<1e-10);
});
test('telemetry rejects invalid timings, keeps a bounded sliding window and clears',()=>{
 const t=createTelemetry(8);
 assert.equal(t.record('gpu',NaN),false);
 assert.equal(t.record('gpu',0),false);
 assert.equal(t.record('gpu',Infinity),false);
 for(let i=1;i<=12;i++)t.record('gpu',i);
 const stats=t.stats('gpu');assert.equal(stats.count,8);assert.equal(stats.p50,8.5);assert.ok(Math.abs(stats.p95-11.65)<1e-10);assert.ok(Math.abs(stats.p99-11.93)<1e-10);
 assert.equal(t.stats('cpu').p95,null);
 assert.throws(()=>t.record('__proto__',1),RangeError);
 t.clear();assert.equal(t.stats('gpu').count,0);
 assert.throws(()=>createTelemetry(1),RangeError);
});
test('resolution governor requires measured GPU+CPU evidence and respects bounds',()=>{
 const g=createResolutionGovernor({minScale:.7,maxScale:1.25,initialScale:1.25,cooldownMs:1000});
 assert.equal(g.update({nowMs:1000,gpuP95:20,cpuP95:2,gpuSamples:0,cpuSamples:50}),1.25);
 for(let t=1000;t<=10000;t+=1000)g.update({nowMs:t,gpuP95:12,cpuP95:2,gpuSamples:50,cpuSamples:50});
 assert.equal(g.getScale(),.7);
 for(let t=11000;t<=13000;t+=1000)g.update({nowMs:t,gpuP95:2,cpuP95:2,gpuSamples:50,cpuSamples:50});
 assert.equal(g.getScale(),.8);
 for(let t=14000;t<=50000;t+=1000)g.update({nowMs:t,gpuP95:2,cpuP95:2,gpuSamples:50,cpuSamples:50});
 assert.equal(g.getScale(),1.25);
});
test('resolution governor has cooldown and no jitter near target',()=>{
 const g=createResolutionGovernor({minScale:.8,maxScale:1.1,initialScale:1.1,cooldownMs:2500,targetFps:165});
 const data=(nowMs,gpuP95)=>({nowMs,gpuP95,cpuP95:2,gpuSamples:40,cpuSamples:40});
 assert.equal(g.update(data(1000,9)),1);
 assert.equal(g.update(data(2000,9)),1);
 assert.equal(g.update(data(4000,5)),1);
 assert.equal(g.update(data(5000,5)),1);
 assert.equal(g.update(data(6000,5)),1);
 assert.throws(()=>createResolutionGovernor({minScale:1.25,maxScale:.7}),RangeError);
});
test('unsupported GPU timer is disabled rather than estimating GPU timing',()=>{
 const t=createGpuTimer({getExtension:()=>null},()=>{throw Error('Must not be called');});
 assert.equal(t.supported,false);assert.equal(t.begin(),false);t.end();t.poll();t.dispose();
});
test('GPU timer samples asynchronously and releases queries',()=>{
 let next=0,available=false,disjoint=false;const deleted=[],samples=[];
 const gl={QUERY_RESULT_AVAILABLE:1,QUERY_RESULT:2,getExtension:()=>({TIME_ELAPSED_EXT:3,GPU_DISJOINT_EXT:4}),getParameter:()=>disjoint,
  createQuery:()=>({id:++next}),beginQuery:()=>{},endQuery:()=>{},getQueryParameter:(q,p)=>p===1?available:4200000,deleteQuery:q=>deleted.push(q.id)};
 const t=createGpuTimer(gl,ms=>samples.push(ms));
 assert.equal(t.supported,true);assert.equal(t.begin(),true);t.end();t.poll();assert.deepEqual(samples,[]);
 available=true;t.poll();assert.deepEqual(samples,[4.2]);assert.deepEqual(deleted,[1]);
 t.begin();t.end();disjoint=true;t.poll();assert.deepEqual(samples,[4.2]);
 assert.equal(t.begin(),false,'GPU disjoint must pause new timing queries');
 disjoint=false;t.poll();
 assert.equal(t.begin(),true);t.end();t.dispose();assert.deepEqual(deleted,[1,2,3]);
 assert.equal(t.begin(),false);
});
