'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../src/app.js'),'utf8');

function extract(start,end){
 const i=source.indexOf(start),j=source.indexOf(end,i+start.length);
 assert.ok(i>=0&&j>i,'expected live BR browser controller section '+start);
 return source.slice(i,j);
}
const matchReader=extract('let checkpointReadUnavailable=false,checkpointInvalidStored=false,memoryOnlyMatch=false;','function collectAmmo(){');
const playHandler=extract("$('play').addEventListener('click',()=>{","$('newMatch').addEventListener");
function fixture({denyReads=0,primary='valid',backup=null}={}){
 const slots=new Map([['veilpoint.brCheckpoint.v1',primary]]);
 if(backup!==null)slots.set('veilpoint.brCheckpoint.v1.previous',backup);
 const events={reads:0,deletes:0,starts:0,resumes:0,denials:denyReads,repairWrites:0,lastResumed:null};
 const storage={
  getItem(k){events.reads++;if(events.denials-->0)throw new Error('SecurityError: storage denied');return slots.get(k)||null;},
  setItem(k,v){slots.set(k,v);events.repairWrites++;},
  removeItem(k){slots.delete(k);events.deletes++;}
 };
 const Game={
  recoverMatch(current,previous){
   if(current==='valid')return {source:'primary',state:{seed:17,source:'primary'}};
   if(previous==='backup-valid')return {source:'backup',state:{seed:17,source:'backup'}};
   if(current===null&&previous===null)return null;
   throw new RangeError('corrupt browser checkpoint');
  }
 };
 const tagline={textContent:''},play={textContent:'',addEventListener(event,fn){assert.equal(event,'click');events.click=fn;}};
 const ctx={Game,storage,play,tagline,events};
 const factory=`(function(runtime){
  const Game=runtime.Game,global={localStorage:runtime.storage};
  const MATCH_SAVE_KEY='veilpoint.brCheckpoint.v1',MATCH_BACKUP_KEY='veilpoint.brCheckpoint.v1.previous';
  let running=false,suspended=false,lastFinishedMatch=null;
  let matchDiskGeneration=null;
  function clearStoredMatch(){
    runtime.events.deletes+=2;
    runtime.storage.removeItem(MATCH_SAVE_KEY);
    runtime.storage.removeItem(MATCH_BACKUP_KEY);
  }
  function start(seed,weapon,roster,offlineOnly=false){runtime.events.starts++;runtime.events.memoryOnly=offlineOnly;}
  function resumeMatch(){}
  function resumeStoredMatch(state){runtime.events.resumes++;runtime.events.lastResumed=state;}
  function syncMotorSound(){}
  const document={querySelector(selector){if(selector==='.tagline')return runtime.tagline;throw new Error('selector '+selector);}};
  const $=id=>id==='play'?runtime.play:{textContent:''};
  ${matchReader}
  ${playHandler}
  return {read:storedMatch,click:()=>runtime.events.click(),getUnavailable:()=>checkpointReadUnavailable};
 })`;
 const controller=vm.runInNewContext(factory,{})(ctx);
 return {controller,events,storage,slots,tagline,play};
}

test('BR transient storage read exception never deletes or overwrites a valid saved round',()=>{
 const h=fixture({denyReads:1,primary:'valid',backup:'backup-valid'});
 h.controller.click();
 assert.equal(h.events.starts,1,'blocked storage still permits a separate, playable local session');
 assert.equal(h.events.memoryOnly,true,'the existing saved round is protected by memory-only mode');
 assert.equal(h.events.resumes,0);
 assert.equal(h.events.deletes,0);
 assert.equal(h.events.repairWrites,0);
 assert.equal(h.slots.get('veilpoint.brCheckpoint.v1'),'valid');
 assert.equal(h.slots.get('veilpoint.brCheckpoint.v1.previous'),'backup-valid');
 assert.equal(h.controller.getUnavailable(),true);
 const later=fixture({denyReads:1,primary:'valid',backup:'backup-valid'});
 assert.equal(later.controller.read(),null);
 later.controller.click();
 assert.equal(later.controller.getUnavailable(),false);
 assert.equal(later.events.starts,0);
 assert.equal(later.events.resumes,1,'a subsequent successful read resumes the original match');
 assert.equal(later.events.lastResumed.seed,17);
});

test('BR startup resumes from one validated generation without a risky second read',()=>{
 const h=fixture({primary:'valid'});
 h.controller.click();
 assert.equal(h.events.reads,2,'primary and backup are read once, not twice');
 assert.equal(h.events.resumes,1);
 assert.equal(h.events.starts,0);
 assert.equal(h.events.lastResumed.source,'primary');
 assert.match(source,/function resumeStoredMatch\(restored\)/);
 assert.doesNotMatch(extract('function resumeStoredMatch(restored){','if(storedMatch())'),
  /const restored=storedMatch\(\)/);
});

test('BR a corrupt primary can still recover from a valid backup without losing either record',()=>{
 const h=fixture({primary:'damaged',backup:'backup-valid'});
 const recovered=h.controller.read();
 assert.equal(recovered.source,'backup');
 assert.equal(h.events.deletes,0);
 assert.equal(h.slots.get('veilpoint.brCheckpoint.v1'),'backup-valid',
  'the validated backup repairs the primary slot');
 assert.equal(h.controller.getUnavailable(),false);
});

test('BR structurally corrupt saved data is distinguished from temporary read failure',()=>{
 const h=fixture({primary:'damaged',backup:'broken'});
 const result=h.controller.read();
 assert.equal(result,null);
 assert.equal(h.controller.getUnavailable(),false);
 assert.equal(h.events.deletes,0,'invalid checkpoint bytes must not be destroyed automatically');
 assert.equal(h.slots.get('veilpoint.brCheckpoint.v1'),'damaged');
 assert.equal(h.slots.get('veilpoint.brCheckpoint.v1.previous'),'broken');
 h.controller.click();
 assert.equal(h.events.starts,1,'BR remains playable in memory-only mode');
 assert.equal(h.events.memoryOnly,true);
 assert.equal(h.events.deletes,0);
});

test('BR PC menu has an explicit New Match control and protects temporarily unreadable checkpoint',()=>{
 assert.match(source,/if\(storedMatch\(\)\)\$\('play'\)\.textContent='저장 경기 이어하기';\s*else if\(checkpointReadUnavailable\|\|checkpointInvalidStored\)/);
 assert.match(source,/\$\('newMatch'\)\.addEventListener\('click',start\)/);
 assert.match(source,/else if\(checkpointReadUnavailable\|\|checkpointInvalidStored\)\{[\s\S]*?start\(null,null,null,true\)/);
 assert.match(source,/if\(!offlineOnly\)\{clearStoredMatch\(\);clearFieldBookmark\(\);clearLastResult\(\);checkpointInvalidStored=false;\}/);
 assert.match(source,/if\(!memoryOnlyMatch\)\{archiveLastResult\(\);clearStoredMatch\(\);clearFieldBookmark\(\);\}/);
 assert.match(source,/if\(!running\|\|memoryOnlyMatch\)return false/);
 assert.match(source,/memoryOnlyMatch\)start\(null,null,null,true\)/);
 assert.match(source,/if\(saved\)resumeStoredMatch\(saved\)/);
});
