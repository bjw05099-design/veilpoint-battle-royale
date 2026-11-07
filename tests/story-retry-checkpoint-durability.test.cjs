'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../src/story-app.js'),'utf8');
const begin=source.indexOf('  function resume(){');
const end=source.indexOf('  function begin(fromCheckpoint){',begin);
assert.ok(begin>=0&&end>begin,'CH01 resume controller must remain available');
const code=source.slice(begin,end);

function scenario({phase='failed',primary='alive',backup=null,live=null,
 replaceBackupDuringRestore=false}={}){
 const stateOf=(stage,elapsed=12)=>({phase:stage,world:{elapsed,player:{weaponId:'standard'}}});
 const entries={alive:stateOf('engagement',12),backup:stateOf('exit',22)};
 const stored=new Map([['primary',primary],['backup',backup]]);
 const controls={storyWeapon:{value:'standard'}};
 const menu={classList:{add(name){assert.equal(name,'hidden');}}};
 const choices={classList:{add(name){assert.equal(name,'hidden');}}};
 const calls=[];
 const ctx={
  state:stateOf(phase,31),renderer:{},graphicsContextLost:false,
  cancelPreviousRestore(){},
  SAVE_KEY:'primary',BACKUP_KEY:'backup',checkpoint:live,
  storage:{get(key){return stored.get(key)||null;}},
  diskGeneration:primary,guidanceId:'pending',shotSavePending:true,firstShotSaved:true,
  lastAutosaveAt:3,saveFailed:false,menu,choices,running:false,
  Story:{
   restore(raw){
    if(!entries[raw])throw new Error('invalid checkpoint');
    if(raw==='backup'&&replaceBackupDuringRestore)
     stored.set('backup','replacement');
    return stateOf(entries[raw].phase,entries[raw].world.elapsed);
   },
   createState(){return stateOf('engagement',0);}
  },
  $:id=>controls[id],desktopUi:{cancel(){}},
  clock:{reset(){}},limiter:{reset(){}},performance:{now:()=>250},
  clearInput(){},Desktop:{focusGameplay(){}},
  document:{},canvas:{},requestAimLock(){},updateHud(){},showChoices(){},
  persist(reason){calls.push({reason,phase:ctx.state.phase,running:ctx.running,elapsed:ctx.state.world.elapsed});return true;}
 };
 vm.runInNewContext(code+'\nresume();',ctx,{timeout:1000});
 return {ctx,calls};
}
test('CH01 retry durably acknowledges recovered alive primary before 60Hz play',()=>{
 const {ctx,calls}=scenario();
 assert.equal(ctx.state.phase,'engagement');
 assert.equal(ctx.state.world.elapsed,12);
 assert.equal(ctx.running,true);
 assert.equal(ctx.lastAutosaveAt,12);
 assert.deepEqual(calls,[{reason:'CH01 재시도 시작',phase:'engagement',running:false,elapsed:12}]);
});
test('CH01 retry attempts durable rescue from backup before releasing keyboard',()=>{
 const {ctx,calls}=scenario({primary:'invalid',backup:'backup'});
 assert.equal(ctx.state.phase,'exit');
 assert.equal(ctx.state.world.elapsed,22);
 assert.equal(calls.length,1);
 assert.equal(calls[0].running,false);
 assert.equal(calls[0].phase,'exit');
});
test('CH01 falls back to new playable state when no prior generation is usable',()=>{
 const {ctx,calls}=scenario({primary:'invalid',backup:'invalid',live:'invalid'});
 assert.equal(ctx.state.phase,'engagement');
 assert.equal(ctx.state.world.elapsed,0);
 assert.equal(calls.length,1);
 assert.equal(calls[0].phase,'engagement');
 assert.equal(calls[0].running,false);
});
test('ordinary paused resume does not rewrite the same saved checkpoint',()=>{
 const {ctx,calls}=scenario({phase:'engagement'});
 assert.equal(ctx.running,true);
 assert.equal(calls.length,0);
});

test('CH01 retry rejects an out-of-date backup replaced during validation',()=>{
 const {ctx,calls}=scenario({
  primary:'invalid',backup:'backup',live:null,replaceBackupDuringRestore:true
 });
 assert.equal(ctx.state.phase,'engagement');
 assert.equal(ctx.state.world.elapsed,0,
  'do not revive a stale backup after another tab rotates its generation');
 assert.equal(ctx.running,true);
 assert.deepEqual(calls,[{reason:'CH01 재시도 시작',
  phase:'engagement',running:false,elapsed:0}]);
});
