'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const Sim=require('../src/simulation.js');
const source=fs.readFileSync(path.join(__dirname,'../src/app.js'),'utf8');
const ownStart=source.indexOf('function ownsStoredMatch(){');
const ownEnd=source.indexOf('// All automatic BR checkpoint writes',ownStart);
const saveStart=source.indexOf('function recordFieldBookmark(){');
const saveEnd=source.indexOf('// LocalStorage JSON serialization',saveStart);
assert.ok(ownStart>=0&&ownEnd>ownStart&&saveStart>=0&&saveEnd>saveStart,
 'production BR bookmark and ownership logic must be directly tested');
const production=source.slice(ownStart,ownEnd)+'\n'+source.slice(saveStart,saveEnd);
const PRIMARY='veilpoint.brCheckpoint.v1',BOOKMARK='veilpoint.brFieldBookmark.v1';

function fixture({silent=false,replaceBookmark=false,changePrimary=false,
 memoryOnly=false,invalidGame=false,previousManual='previous-manual'}={}){
 const simulation=Sim.newMatch(20261106,2,'carbine');
 simulation.status='playing';
 if(invalidGame)simulation.player.health=Infinity;
 const rawPrimary='same-owner-generation';
 const slots=new Map([[PRIMARY,rawPrimary],[BOOKMARK,'previous-disk']]);
 let writes=0;
 const storage={
  getItem(key){return slots.has(key)?slots.get(key):null;},
  setItem(key,value){
   writes++;
   if(!silent)slots.set(key,replaceBookmark&&key===BOOKMARK?'newer-tab-bookmark':value);
   if(changePrimary&&key===BOOKMARK)slots.set(PRIMARY,'newer-tab-primary');
  }
 };
 const ctx={storage,simulation,Game:Sim,memoryOnly,previousManual,rawPrimary};
 const js=`(function({storage,simulation,Game,memoryOnly,previousManual,rawPrimary}){
  const global={localStorage:storage};
  const MATCH_SAVE_KEY='veilpoint.brCheckpoint.v1',
   FIELD_BOOKMARK_KEY='veilpoint.brFieldBookmark.v1';
  let memoryOnlyMatch=memoryOnly;
  let matchDiskGeneration=rawPrimary,manualCheckpoint=previousManual,
   bookmarkIssue=null,saveIssue=null,saveWarning=false,nextMatchSaveRetryAt=0;
  ${production}
  return {recordFieldBookmark,state(){return {manualCheckpoint,bookmarkIssue,
    saveIssue,saveWarning,nextMatchSaveRetryAt};}};
 })`;
 const api=vm.runInNewContext(js,{})(ctx);
 return {api,simulation,slots,get writes(){return writes;}};
}
test('BR P-key field bookmark acknowledges only exact durable bytes',()=>{
 const f=fixture(),raw=Sim.snapshotMatch(f.simulation);
 assert.equal(f.api.recordFieldBookmark(),true);
 assert.equal(f.slots.get(BOOKMARK),raw);
 assert.equal(f.api.state().manualCheckpoint,raw);
 assert.equal(f.api.state().bookmarkIssue,null);
 assert.equal(Sim.snapshotMatch(Sim.restoreMatch(raw)),raw);
});
test('BR silent storage discard cannot falsely announce durable P-key bookmark',()=>{
 const f=fixture({silent:true});
 assert.equal(f.api.recordFieldBookmark(),false);
 assert.equal(f.api.state().bookmarkIssue,'write-failed');
 assert.equal(f.slots.get(BOOKMARK),'previous-disk');
 assert.equal(f.api.state().manualCheckpoint,Sim.snapshotMatch(f.simulation),
  'the current tab retains a valid manual rewind');
});
test('BR a concurrently replaced bookmark is not mistaken for our new durable generation',()=>{
 const f=fixture({replaceBookmark:true});
 assert.equal(f.api.recordFieldBookmark(),false);
 assert.equal(f.slots.get(BOOKMARK),'newer-tab-bookmark');
 assert.equal(f.api.state().bookmarkIssue,'write-failed');
});
test('BR P-key rejects an invalid world without erasing earlier in-memory or disk bookmark',()=>{
 const f=fixture({invalidGame:true});
 assert.equal(f.api.recordFieldBookmark(),false);
 assert.equal(f.writes,0);
 assert.equal(f.api.state().manualCheckpoint,'previous-manual');
 assert.equal(f.slots.get(BOOKMARK),'previous-disk');
 assert.equal(f.api.state().bookmarkIssue,'write-failed');
});
test('BR a second tab changing primary during bookmark write triggers visible conflict',()=>{
 const f=fixture({changePrimary:true});
 assert.equal(f.api.recordFieldBookmark(),false);
 assert.equal(f.api.state().bookmarkIssue,'conflict');
 assert.equal(f.api.state().saveIssue,'conflict');
 assert.equal(f.api.state().saveWarning,true);
 assert.equal(f.slots.get(PRIMARY),'newer-tab-primary');
});
test('BR memory-only match keeps P-key rewind locally and never writes a shared bookmark',()=>{
 const f=fixture({memoryOnly:true});
 assert.equal(f.api.recordFieldBookmark(),false);
 assert.equal(f.writes,0);
 assert.equal(f.slots.get(BOOKMARK),'previous-disk');
 assert.equal(f.api.state().manualCheckpoint,Sim.snapshotMatch(f.simulation));
});
