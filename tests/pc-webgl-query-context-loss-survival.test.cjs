'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createGpuTimer}=require('../src/performance.js');

function failingDriver(failure){
 let serial=0;
 const deleted=[],samples=[],invalidated=[];
 const gl={
  QUERY_RESULT_AVAILABLE:1,QUERY_RESULT:2,
  getExtension(){if(failure==='extension')throw Error('context lost');return {
   TIME_ELAPSED_EXT:3,GPU_DISJOINT_EXT:4};},
  getParameter(){if(failure==='poll')throw Error('context lost');return false;},
  createQuery(){return {id:++serial};},
  beginQuery(){if(failure==='begin')throw Error('device reset');},
  endQuery(){if(failure==='end')throw Error('device reset');},
  getQueryParameter(){if(failure==='query')throw Error('context lost');
   return false;},
  deleteQuery(q){deleted.push(q.id);}
 };
 const timer=createGpuTimer(gl,(ms,issuedAt)=>samples.push({ms,issuedAt}),
  ()=>invalidated.push(true));
 return {timer,deleted,samples,invalidated};
}
test('an unavailable WebGL extension never crashes PC renderer setup',()=>{
 const {timer,invalidated}=failingDriver('extension');
 assert.equal(timer.supported,false);
 assert.equal(timer.begin(100),false);
 assert.doesNotThrow(()=>{timer.poll(101);timer.end();timer.dispose();});
 assert.equal(invalidated.length,0);
});
for(const failed of ['begin','end','poll','query']){
 test('GPU timer retires all evidence after '+failed+' WebGL context failure',()=>{
  const {timer,deleted,samples,invalidated}=failingDriver(failed);
  assert.equal(timer.supported,true);
  if(failed==='begin')assert.equal(timer.begin(100),false);
  else{
   assert.equal(timer.begin(100),true);
   timer.end();
   assert.doesNotThrow(()=>timer.poll(150));
  }
  assert.equal(invalidated.length,1,'GPU evidence reset is reported exactly once');
  assert.deepEqual(samples,[],'no synthetic GPU performance value is issued');
  assert.deepEqual(deleted,[1],'the pending/current query is retired');
  assert.equal(timer.begin(151),false,'a lost device never silently resumes timing');
  assert.doesNotThrow(()=>{timer.end();timer.poll(152);timer.dispose();});
  assert.equal(invalidated.length,1);
 });
}
