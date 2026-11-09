'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Story=require('../src/story-slice.js');

function evac(){
  return Story.restore(JSON.stringify({
    version:1,phase:'exit',found:[],choice:'evacuation',
    player:{x:-9,z:-55,yaw:0,pitch:0,stamina:100},elapsed:12
  }));
}
function go(state,id){
  state.world.player.x=Story.POINTS[id].x;
  state.world.player.z=Story.POINTS[id].z;
}
function exitStatus(s){
  return Story.missionTasks(s).find(task=>task.id==='exit').status;
}

test('CH01 cargo exit is visibly blocked until the finite crate is staged',()=>{
  const s=evac();
  assert.equal(exitStatus(s),'available');
  go(s,'aidPickup');assert.equal(Story.interact(s).event,'aidPickup');
  assert.equal(s.world.carryingAid,true);
  assert.equal(exitStatus(s),'blocked','task tracker must not advertise a finish that E rejects');
  assert.match(Story.objective(s),/임시 적재대/);
  go(s,'exitEvac');assert.equal(Story.nearest(s)?.id,'exitEvac');
  assert.equal(Story.interact(s).reason,'cargo_handoff_required');
  assert.equal(s.phase,'exit');
  const raw=Story.serialize(s),reloaded=Story.restore(raw);
  assert.equal(Story.serialize(reloaded),raw);
  assert.equal(exitStatus(reloaded),'blocked');
  for(let tick=0;tick<120;tick++)Story.step(reloaded,1/60,{});
  assert.equal(exitStatus(reloaded),'blocked');
  go(reloaded,'aidStage');assert.equal(Story.interact(reloaded).event,'aidStage');
  assert.equal(reloaded.world.carryingAid,false);
  assert.equal(exitStatus(reloaded),'available');
  go(reloaded,'exitEvac');assert.equal(Story.interact(reloaded).ok,true);
  assert.equal(exitStatus(reloaded),'done');
  assert.equal(Story.debrief(reloaded).aidStaged,true);
});

test('CH01 physical staffed cargo handoff clears exit prerequisite after reload',()=>{
  const s=evac();go(s,'aidPickup');assert.equal(Story.interact(s).ok,true);
  const raw=Story.serialize(s);
  const restored=Story.restore(raw);
  go(restored,'aidDrop');assert.equal(Story.interact(restored).event,'aidDrop');
  assert.equal(restored.aidDelivered,true);
  assert.equal(exitStatus(restored),'available');
  const after=Story.restore(Story.serialize(restored));
  assert.equal(after.aidDelivered,true);
  assert.equal(exitStatus(after),'available');
});

test('CH01 PC interaction HUD distinguishes blocked cargo, required escort and actual completion',()=>{
  const app=fs.readFileSync(path.resolve(__dirname,'../src/story-app.js'),'utf8');
  assert.match(app,/nearby\.id==='exitEvac'&&state\.world\.carryingAid/);
  assert.match(app,/출구 통과 보류 · 운반 중인 물품/);
  assert.match(app,/nearby\.id==='exitEvac'&&state\.guide\.active&&!state\.guide\.arrived/);
  assert.match(app,/출구 통과 보류 · 안내원의 실제 안뜰 도착/);
  assert.match(app,/situation\.guideStatus\.includes\('F로 동행 재개 가능'\)/);
  const active=evac();
  active.musterConfirmed=true;
  active.guide.active=true;
  assert.equal(exitStatus(active),'blocked');
  active.guide.released=true;
  active.guide.active=false;
  assert.equal(exitStatus(active),'available');
  assert.equal(active.phase,'exit');
});
