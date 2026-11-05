'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');

// Exercise the production persistence functions directly with quota-denied
// browser storage, without launching a renderer or reimplementing save logic.
const source=fs.readFileSync(path.join(__dirname,'../src/app.js'),'utf8');
function extract(begin,end){
  const i=source.indexOf(begin),j=source.indexOf(end,i+begin.length);
  assert.ok(i>=0&&j>i,'expected live BR controller functions');
  return source.slice(i,j);
}
const retryPolicy=extract('function canAutoPersistMatch(){','let lastFinishedMatch=');
const persistence=extract('function persistMatch(){','function storedMatch(){');
const frameSave=source.match(/if\(simulation\.status==='playing'&&canAutoPersistMatch\(\)&&\s*\(saveWarning\|\|simulation\.elapsed-lastAutosaveElapsed>=15 \|\|\s*\(simulation\.player\.health<lastSavedHealth-\.5&&simulation\.elapsed-lastAutosaveElapsed>=1\)\)\)persistMatch\(\);/);
assert.ok(frameSave,'autosave loop must reuse the same 1s failed-write policy');
const shotSave=source.match(/if\(\(immediateSave\|\|simulation\.elapsed-lastAutosaveElapsed>=SHOT_SAVE_INTERVAL_SECONDS\)&&\s*canAutoPersistMatch\(\)\)persistMatch\(\);/);
assert.ok(shotSave,'held and mouse fire must honor automatic retry throttling');

function harness({denied=0,previous=null}={}){
  const slots=new Map(previous?[['veilpoint.brCheckpoint.v1',previous]]:[]);
  const events={primaryWrites:0,backupWrites:0,denied};
  const storage={
    getItem(k){return slots.get(k)||null;},
    setItem(k,v){
      if(k==='veilpoint.brCheckpoint.v1'){
        events.primaryWrites++;
        if(events.denied>0){events.denied--;throw new Error('quota exceeded');}
      }else if(k==='veilpoint.brCheckpoint.v1.previous')events.backupWrites++;
      slots.set(k,v);
    }
  };
  const simulation={status:'playing',elapsed:0,player:{health:82,charges:12,loaded:5},message:'',messageTime:0};
  const context={storage,simulation,game:{
    snapshotMatch(s){return JSON.stringify({status:s.status,elapsed:s.elapsed,health:s.player.health,charges:s.player.charges,loaded:s.player.loaded});},
    restoreMatch(raw){const data=JSON.parse(raw);if(!data||data.status!=='playing')throw new RangeError('bad prior save');return data;}
  }};
  const wrapper=`(function(runtime){
    const global={localStorage:runtime.storage},Game=runtime.game;
    const MATCH_SAVE_KEY='veilpoint.brCheckpoint.v1';
    const MATCH_BACKUP_KEY='veilpoint.brCheckpoint.v1.previous';
    let simulation=runtime.simulation,running=true;
    let lastAutosaveElapsed=0,lastSavedHealth=100,saveWarning=false,nextMatchSaveRetryAt=0;
    const SHOT_SAVE_INTERVAL_SECONDS=1;
    function clearStoredMatch(){throw new Error('unexpected terminal clear');}
    ${retryPolicy}
    ${persistence}
    function autoFrame(){${frameSave[0]}}
    function autoShot(immediateSave=false){${shotSave[0]}}
    return {persistMatch,autoFrame,autoShot,canAutoPersistMatch,
      state:()=>({lastAutosaveElapsed,lastSavedHealth,saveWarning,nextMatchSaveRetryAt})};
  })`;
  const api=vm.runInNewContext(wrapper,{})(context);
  return {api,simulation,events,slots};
}

test('BR denied offline checkpoint writes retry after one simulation second, not at render rate',()=>{
  const h=harness({denied:2});
  assert.equal(h.api.persistMatch(),false);
  assert.equal(h.events.primaryWrites,1);
  assert.equal(h.api.state().saveWarning,true);
  assert.equal(h.api.state().nextMatchSaveRetryAt,1);
  assert.equal(h.api.state().lastAutosaveElapsed,0);
  h.simulation.elapsed=.5;
  for(let frame=0;frame<180;frame++){h.api.autoFrame();h.api.autoShot(true);}
  assert.equal(h.events.primaryWrites,1,'neither rendering nor held fire may cause a write storm');
  h.simulation.elapsed=1;
  h.api.autoFrame();
  assert.equal(h.events.primaryWrites,2);
  assert.equal(h.api.state().nextMatchSaveRetryAt,2);
  h.simulation.elapsed=1.5;
  for(let frame=0;frame<120;frame++)h.api.autoShot(true);
  assert.equal(h.events.primaryWrites,2);
  h.simulation.elapsed=2;
  h.api.autoFrame();
  assert.equal(h.events.primaryWrites,3);
  assert.equal(h.api.state().saveWarning,false);
  assert.equal(h.api.state().lastAutosaveElapsed,2);
  assert.equal(h.api.state().nextMatchSaveRetryAt,0);
  assert.match(h.simulation.message,/CHECKPOINT RESTORED/);
  assert.equal(JSON.parse(h.slots.get('veilpoint.brCheckpoint.v1')).health,82,
    'retry saves the same finite health and ammo state');
  h.simulation.elapsed=3;
  h.api.autoFrame();
  assert.equal(h.events.primaryWrites,3,'healthy matches return to normal 15s cadence');
});

test('BR explicit PC Save & Exit remains immediate despite automatic retry backoff',()=>{
  const h=harness({denied:1});
  assert.equal(h.api.persistMatch(),false);
  h.simulation.elapsed=.12;
  assert.equal(h.api.canAutoPersistMatch(),false);
  assert.equal(h.api.persistMatch(),true,'the deliberate user save may retry immediately');
  assert.equal(h.events.primaryWrites,2);
  assert.equal(h.api.state().nextMatchSaveRetryAt,0);
  assert.equal(h.api.state().saveWarning,false);
  assert.match(source,/\$\('saveExit'\)\.addEventListener\('click',[\s\S]*?if\(!persistMatch\(\)\)/);
});

test('BR backup generation is protected while a primary slot temporarily denies writes',()=>{
  const previous=JSON.stringify({status:'playing',elapsed:5,health:61,charges:7,loaded:3});
  const h=harness({denied:1,previous});
  h.simulation.elapsed=8;
  assert.equal(h.api.persistMatch(),false);
  assert.equal(h.slots.get('veilpoint.brCheckpoint.v1'),previous,
    'failed primary update must not falsely replace a valid saved match');
  assert.equal(h.slots.get('veilpoint.brCheckpoint.v1.previous'),previous,
    'backup remains a valid previous generation');
  h.simulation.elapsed=9;
  h.api.autoFrame();
  assert.equal(h.api.state().saveWarning,false);
  assert.equal(JSON.parse(h.slots.get('veilpoint.brCheckpoint.v1')).elapsed,9);
  assert.equal(h.slots.get('veilpoint.brCheckpoint.v1.previous'),previous);
});

test('BR recovery policy is reset when starting, resuming or restoring an arena',()=>{
  assert.match(source,/if\(!offlineOnly\)\{clearStoredMatch\(\);clearFieldBookmark\(\);clearLastResult\(\);\}\s*memoryOnlyMatch=offlineOnly;saveWarning=false;\s*nextMatchSaveRetryAt=0/);
  assert.match(source,/running=true;suspended=false;saveWarning=false;nextMatchSaveRetryAt=0;lastAutosaveElapsed=simulation\.elapsed/);
  assert.match(source,/function resumeStoredMatch\(/);
  assert.match(source,/function recordFieldBookmark\(/);
});
