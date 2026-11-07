'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const Sim=require('../src/simulation.js');
const source=fs.readFileSync(path.join(__dirname,'../src/app.js'),'utf8');
function extract(begin,end){
 const i=source.indexOf(begin),j=source.indexOf(end,i+begin.length);
 assert.ok(i>=0&&j>i,'production BR field bookmark code must remain testable');
 return source.slice(i,j);
}
const code=extract('function ownsStoredMatch(){','// All automatic BR checkpoint writes')
 + '\n'+extract('function clearFieldBookmark(explicitReset=false){','function loadFieldBookmark(){')
 + '\n'+extract('function loadFieldBookmark(){','function recordFieldBookmark(){');
const KEY='veilpoint.brFieldBookmark.v1',PRIMARY='veilpoint.brCheckpoint.v1';

function fixture({denyRead=false,invalid=false,otherTab=false,replaceDuringRepair=false,denyRepairRead=false}={}){
 const sim=Sim.newMatch(20261106,2,'carbine');
 sim.status='playing';
 const saved=invalid?'{corrupt-bookmark':Sim.snapshotMatch(sim);
 const owned='our-round';
 const slots=new Map([[PRIMARY,otherTab?'newer-tab':owned],[KEY,saved]]);
 let removes=0,sets=0,bookmarkReads=0;
 const storage={
  getItem(key){
   if(key===KEY){
    bookmarkReads++;
    if(denyRead||(denyRepairRead&&bookmarkReads===2))throw new Error('transient localStorage SecurityError');
    if(replaceDuringRepair&&bookmarkReads===2)slots.set(KEY,'newer-tab-bookmark');
   }
   return slots.has(key)?slots.get(key):null;
  },
  setItem(key,val){sets++;slots.set(key,val);},
  removeItem(key){removes++;slots.delete(key);}
 };
 const context={storage,sim,Game:Sim,owned};
 const fn=vm.runInNewContext(`(function({storage,sim,Game,owned}){
  const global={localStorage:storage};
  const MATCH_SAVE_KEY='veilpoint.brCheckpoint.v1',
    FIELD_BOOKMARK_KEY='veilpoint.brFieldBookmark.v1';
  let simulation=sim,matchDiskGeneration=owned,manualCheckpoint='in-memory-rewind',
    bookmarkIssue=null;
  ${code}
  return {loadFieldBookmark,
   get state(){return {manualCheckpoint,bookmarkIssue};}};
 })`,{})(context);
 return {fn,slots,saved,get removes(){return removes;},get sets(){return sets;}};
}
test('BR transient bookmark read denial preserves the full previous generation',()=>{
 const f=fixture({denyRead:true});
 assert.equal(f.fn.loadFieldBookmark(),null);
 assert.equal(f.slots.get(KEY),f.saved);
 assert.equal(f.fn.state.manualCheckpoint,'in-memory-rewind');
 assert.equal(f.fn.state.bookmarkIssue,'write-failed');
 assert.equal(f.removes,0);assert.equal(f.sets,0);
});
test('BR normal P-key bookmark loading validates exact round without deleting it',()=>{
 const f=fixture();
 assert.equal(f.fn.loadFieldBookmark(),f.saved);
 assert.equal(f.slots.get(KEY),f.saved);
 assert.equal(f.removes,0);
 assert.equal(f.fn.state.bookmarkIssue,null);
});
test('BR corrupt bookmark is quarantined in place, never destructively cleared on an automatic read',()=>{
 const f=fixture({invalid:true});
 assert.equal(f.fn.loadFieldBookmark(),null);
 assert.equal(f.slots.get(KEY),f.saved);
 assert.equal(f.removes,0);
 assert.equal(f.fn.state.manualCheckpoint,'in-memory-rewind');
 assert.equal(f.fn.state.bookmarkIssue,'write-failed');
});
test('BR corrupt bookmark under a newer tab save remains intact',()=>{
 const f=fixture({invalid:true,otherTab:true});
 assert.equal(f.fn.loadFieldBookmark(),null);
 assert.equal(f.slots.get(KEY),f.saved);
 assert.equal(f.removes,0,'stale tab must not destroy a newer round bookmark');
 assert.equal(f.slots.get(PRIMARY),'newer-tab');
});
test('BR temporary read denial in an older tab never deletes another tab bookmark',()=>{
 const f=fixture({denyRead:true,otherTab:true});
 assert.equal(f.fn.loadFieldBookmark(),null);
 assert.equal(f.slots.get(KEY),f.saved);
 assert.equal(f.slots.get(PRIMARY),'newer-tab');
 assert.equal(f.removes,0);assert.equal(f.sets,0);
});

test('BR does not erase a different tab bookmark arriving during corrupt-slot validation',()=>{
 const f=fixture({invalid:true,replaceDuringRepair:true});
 assert.equal(f.fn.loadFieldBookmark(),null);
 assert.equal(f.slots.get(KEY),'newer-tab-bookmark');
 assert.equal(f.removes,0);
 assert.equal(f.fn.state.bookmarkIssue,'conflict');
});
test('BR preserves the previous bookmark when the repair read loses storage permission',()=>{
 const f=fixture({invalid:true,denyRepairRead:true});
 assert.equal(f.fn.loadFieldBookmark(),null);
 assert.equal(f.slots.get(KEY),f.saved);
 assert.equal(f.removes,0);
 assert.equal(f.fn.state.bookmarkIssue,'write-failed');
});


test('BR a second corrupt bookmark read never erases the only stored generation',()=>{
 const f=fixture({invalid:true});
 assert.equal(f.fn.loadFieldBookmark(),null);
 assert.equal(f.fn.loadFieldBookmark(),null);
 assert.equal(f.slots.get(KEY),f.saved);
 assert.equal(f.removes,0,'no automatic read may clear shared localStorage');
 assert.equal(f.sets,0,'do not overwrite a corrupt bookmark to hide validation errors');
 assert.equal(f.fn.state.manualCheckpoint,'in-memory-rewind');
});
