'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createGpuTimer}=require('../src/performance.js');

function fakeGpu(){
 let next=0,available=false,disjoint=false,active=null;
 const deleted=[],samples=[],invalidations=[];
 const gl={
  QUERY_RESULT_AVAILABLE:1,QUERY_RESULT:2,
  getExtension:()=>({TIME_ELAPSED_EXT:3,GPU_DISJOINT_EXT:4}),
  getParameter:()=>disjoint,
  createQuery:()=>({id:++next}),
  beginQuery:(_target,q)=>{assert.equal(active,null);active=q;},
  endQuery:()=>{assert.ok(active);active=null;},
  getQueryParameter:(_q,kind)=>kind===1?available:6_000_000,
  deleteQuery:q=>deleted.push(q.id)
 };
 const timer=createGpuTimer(gl,(ms,tag)=>samples.push({ms,tag}),()=>invalidations.push('reset'));
 return {timer,deleted,samples,invalidations,setAvailable:v=>{available=v;},setDisjoint:v=>{disjoint=v;}};
}

test('a hung GPU query batch expires once and new draw evidence can resume',()=>{
 const gpu=fakeGpu();
 for(let i=0;i<4;i++){assert.equal(gpu.timer.begin(100+i),true);gpu.timer.end();}
 assert.equal(gpu.timer.begin(104),false,'four pending queries saturate the ring');
 gpu.timer.poll(2599);
 assert.deepEqual(gpu.deleted,[],'a live query must not expire early');
 gpu.timer.poll(2601);
 assert.deepEqual(gpu.deleted,[1,2,3,4]);
 assert.deepEqual(gpu.invalidations,['reset'],'stale timing epoch is invalidated once');
 assert.deepEqual(gpu.samples,[],'no fabricated GPU frame time');
 assert.equal(gpu.timer.begin(2602),true,'the ring must recover without page reload');
 gpu.timer.end();gpu.setAvailable(true);gpu.timer.poll(2603);
 assert.deepEqual(gpu.samples,[{ms:6,tag:2602}]);
 gpu.timer.dispose();
});

test('ready delayed GPU query is consumed instead of spuriously timing out',()=>{
 const gpu=fakeGpu();
 assert.equal(gpu.timer.begin(100),true);gpu.timer.end();
 gpu.setAvailable(true);gpu.timer.poll(10000);
 assert.deepEqual(gpu.samples,[{ms:6,tag:100}]);
 assert.deepEqual(gpu.invalidations,[]);
 assert.deepEqual(gpu.deleted,[1]);
 gpu.timer.dispose();
});

test('unknown, invalid and backward timestamps cannot discard GPU evidence',()=>{
 const gpu=fakeGpu();
 assert.equal(gpu.timer.begin(null),true);gpu.timer.end();
 gpu.timer.poll(10000);
 assert.deepEqual(gpu.deleted,[],'untagged legacy query is not timed out by guesswork');
 gpu.timer.dispose();
 const second=fakeGpu();
 assert.equal(second.timer.begin(200),true);second.timer.end();
 for(const now of [undefined,NaN,Infinity,0,199,2700]){
  if(now===2700)continue;
  second.timer.poll(now);
 }
 assert.deepEqual(second.deleted,[]);
 second.timer.poll(2701);
 assert.deepEqual(second.deleted,[1]);
 assert.deepEqual(second.invalidations,['reset']);
 second.timer.dispose();
});

test('disjoint GPU invalidation still takes precedence over a hung query',()=>{
 const gpu=fakeGpu();
 gpu.timer.begin(100);gpu.timer.end();gpu.setDisjoint(true);
 gpu.timer.poll(10000);gpu.timer.poll(11000);
 assert.deepEqual(gpu.invalidations,['reset']);
 assert.deepEqual(gpu.deleted,[1]);
 assert.equal(gpu.timer.begin(11001),false);
 gpu.setDisjoint(false);gpu.timer.poll(11002);
 assert.equal(gpu.timer.begin(11003),true);
 gpu.timer.dispose();
});
