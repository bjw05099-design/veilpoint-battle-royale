'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const source=fs.readFileSync(path.resolve(__dirname,'../src/story-app.js'),'utf8');
const writer=source.slice(source.indexOf("  function persist(reason='')"),source.indexOf('  function persistShot()'));

function harness(){
  const disk=new Map([['save','previous-generation'],['backup','earlier-generation']]);
  const writes=[];
  const notice={textContent:'',hidden:true,
    classList:{remove(){notice.hidden=false;},toggle(_,isHidden){notice.hidden=!!isHidden;}}};
  const ctx={
    SAVE_KEY:'save',BACKUP_KEY:'backup',PREVIEW_KEY:'preview',
    state:{phase:'exit',world:{elapsed:19}},
    Story:{serialize(){throw Error('invalid live state');},
      restore(){return {phase:'exit'};}},
    storage:{set(key,value){writes.push([key,value]);disk.set(key,value);return true;},
      remove(key){disk.delete(key);}},
    global:{localStorage:{getItem(key){return disk.has(key)?disk.get(key):null;}}},
    $:()=>notice,
    memoryOnlyStory:false,diskGeneration:'previous-generation',
    pendingReplayReset:false,checkpoint:'older-in-memory',
    saveFailed:false,nextSaveRetryAt:0,lastAutosaveAt:10,shotSavePending:true
  };
  vm.runInNewContext(writer+'\nthis.persist=persist;',ctx,{timeout:1000});
  return {ctx,disk,writes,notice};
}

test('CH01 invalid live checkpoint leaves both stored generations untouched and visible',()=>{
  const {ctx,disk,writes,notice}=harness();
  assert.equal(ctx.persist('자동 저장'),false);
  assert.equal(ctx.saveFailed,true);
  assert.equal(ctx.nextSaveRetryAt,20,'retry only after simulated-time cooldown');
  assert.equal(ctx.lastAutosaveAt,10,'last verified save boundary is not advanced');
  assert.equal(ctx.diskGeneration,'previous-generation');
  assert.equal(ctx.checkpoint,'older-in-memory');
  assert.equal(ctx.shotSavePending,true,'dirty progress remains eligible for retry');
  assert.equal(disk.get('save'),'previous-generation');
  assert.equal(disk.get('backup'),'earlier-generation');
  assert.deepEqual(writes,[]);
  assert.equal(notice.hidden,false);
  assert.match(notice.textContent,/저장 검증 실패/);
});

test('CH01 recovered in-memory snapshot later rotates and verifies the exact prior generation',()=>{
  const {ctx,disk,writes,notice}=harness();
  assert.equal(ctx.persist(),false);
  ctx.Story.serialize=()=> 'new-validated-generation';
  assert.equal(ctx.persist('수동 재시도'),true);
  assert.equal(disk.get('backup'),'previous-generation');
  assert.equal(disk.get('save'),'new-validated-generation');
  assert.deepEqual(writes,[['backup','previous-generation'],['save','new-validated-generation']]);
  assert.equal(ctx.diskGeneration,'new-validated-generation');
  assert.equal(ctx.checkpoint,'new-validated-generation');
  assert.equal(ctx.lastAutosaveAt,19);
  assert.equal(ctx.nextSaveRetryAt,0);
  assert.equal(ctx.shotSavePending,false);
  assert.equal(ctx.saveFailed,false);
  assert.equal(notice.hidden,false,'explicit manual checkpoint stays visible');
  assert.match(notice.textContent,/수동 재시도/);
});
