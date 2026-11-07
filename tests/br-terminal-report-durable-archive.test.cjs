'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../src/app.js'),'utf8');
const start=source.indexOf('function ownsStoredMatch(){');
const a=source.indexOf('function clearLastResult(){');
const b=source.indexOf('let pauseRestartArmed=',a);
assert.ok(start>=0&&a>start&&b>a,'production BR terminal persistence functions must exist');
const own=source.slice(start,source.indexOf('// All automatic BR checkpoint writes',start));
const production=own+source.slice(a,b);
const PRIMARY='veilpoint.brCheckpoint.v1',LAST='veilpoint.brLastResult.v1';
const report=Object.freeze({outcome:'won',seed:20261107,rivals:1});
function fixture({silent=false,overwrite=false,denyRead=false,denyWrite=false,
 newPrimaryAfterWrite=false,notOwner=false,invalid=false}={}){
 let removed=0,writes=0;
 const slots=new Map([[PRIMARY,notOwner?'other-tab-primary':'this-match'],
  [LAST,invalid?'{broken':JSON.stringify({outcome:'lost',seed:1})]]);
 const storage={
  getItem(key){if(denyRead&&key===LAST)throw new Error('SecurityError');
   return slots.has(key)?slots.get(key):null;},
  setItem(key,value){
   writes++;
   if(denyWrite)throw new Error('QuotaExceededError');
   if(!silent)slots.set(key,key===LAST&&overwrite?JSON.stringify({outcome:'other'}):value);
   if(key===LAST&&newPrimaryAfterWrite)slots.set(PRIMARY,'other-tab-primary');
  },
  removeItem(key){removed++;slots.delete(key);}
 };
 const Game={
  createLastResult(){return report;},
  restoreLastResult:raw=>JSON.parse(raw)
 };
 const run=new Function('global','Game','simulation','running','matchDiskGeneration','MATCH_SAVE_KEY','LAST_RESULT_KEY',
  production+'\nreturn {archiveLastResult,readLastResult,clearLastResult};');
 const fn=run({localStorage:storage},Game,{status:'won'},true,'this-match',PRIMARY,LAST);
 return {fn,slots,get removed(){return removed;},get writes(){return writes;}};
}
test('BR terminal report can be archived only when the exact bytes are durable',()=>{
 const f=fixture();
 assert.deepEqual(f.fn.archiveLastResult(),report);
 assert.equal(f.slots.get(LAST),JSON.stringify(report));
 assert.deepEqual(f.fn.readLastResult(),report);
 assert.equal(f.removed,0);
});
test('BR silently discarded or overwritten terminal reports are not falsely certified',()=>{
 for(const options of [{silent:true},{overwrite:true},{denyWrite:true}]){
  const f=fixture(options),original=f.slots.get(LAST);
  assert.equal(f.fn.archiveLastResult(),null);
  assert.equal(f.removed,0);
  if(options.silent||options.denyWrite)assert.equal(f.slots.get(LAST),original);
 }
});
test('BR never erases a corrupt last-result archive on failed automatic reads',()=>{
 for(const options of [{invalid:true},{denyRead:true}]){
  const f=fixture(options),original=f.slots.get(LAST);
  assert.equal(f.fn.readLastResult(),null);
  assert.equal(f.removed,0,'a background read cannot destroy shared result history');
  assert.equal(f.slots.get(LAST),original);
 }
});
test('BR terminal archive declines to overwrite a different active match owner',()=>{
 const f=fixture({notOwner:true}),original=f.slots.get(LAST);
 assert.equal(f.fn.archiveLastResult(),null);
 assert.equal(f.writes,0);
 assert.equal(f.slots.get(LAST),original);
});
test('BR post-write ownership loss is detected rather than presented as successful storage',()=>{
 const f=fixture({newPrimaryAfterWrite:true});
 assert.equal(f.fn.archiveLastResult(),null);
 assert.equal(f.slots.get(PRIMARY),'other-tab-primary');
});
test('BR explicit new-round cleanup remains available and visible failure is surfaced',()=>{
 const f=fixture({invalid:true});
 f.fn.clearLastResult();
 assert.equal(f.slots.has(LAST),false);
 assert.equal(f.removed,1);
 assert.match(source,/let archivedResult=null;if\(!memoryOnlyMatch\)\{archivedResult=archiveLastResult\(\)/);
 assert.match(source,/경기 결과 저장 확인 실패/);
});
