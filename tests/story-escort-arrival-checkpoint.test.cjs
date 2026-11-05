'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Story=require('../src/story-slice.js');

function evacuationFromLegacy() {
  const legacy={version:1,phase:'exit',found:[],choice:'evacuation',
    player:{x:-9,z:-55,yaw:0,pitch:0,stamina:100},elapsed:12};
  const state=Story.restore(JSON.stringify(legacy));
  state.world.player.x=Story.POINTS.muster.x;
  state.world.player.z=Story.POINTS.muster.z;
  assert.equal(Story.interact(state).event,'muster');
  assert.equal(Story.interact(state).event,'guide');
  return state;
}

test('CH01 physically arriving civilian produces one immediate durable checkpoint boundary',()=>{
  const s=evacuationFromLegacy();
  const exit=Story.POINTS.exitEvac;
  s.guide.x=exit.x+1.9;s.guide.z=exit.z;
  s.world.player.x=exit.x;s.world.player.z=exit.z;
  const wasArrived=s.guide.arrived;
  assert.equal(wasArrived,false);
  assert.equal(Story.escortArrivalCheckpoint(wasArrived,s),false);
  Story.step(s,1/60,{});
  assert.equal(s.guide.arrived,true,'physical 60Hz arrival is required');
  assert.equal(Story.escortArrivalCheckpoint(wasArrived,s),true,
    'the browser must flush the transition immediately');
  assert.equal(Story.escortArrivalCheckpoint(s.guide.arrived,s),false,
    'later frames must not repeatedly write the same checkpoint');
  const saved=Story.serialize(s),loaded=Story.restore(saved);
  assert.equal(Story.serialize(loaded),saved);
  assert.equal(loaded.guide.arrived,true);
  assert.equal(Story.escortArrivalCheckpoint(loaded.guide.arrived,loaded),false,
    'refresh must not emit a duplicate arrival');
  assert.equal(Story.interact(loaded).ok,true);
  assert.equal(loaded.phase,'complete');
  assert.equal(Story.debrief(loaded).guideArrived,true);
});

test('CH01 checkpoint boundary does not fire from unconfirmed, waiting or already finished escorts',()=>{
  const s=evacuationFromLegacy();
  assert.equal(Story.escortArrivalCheckpoint(false,s),false);
  s.guide.waiting=true;
  s.guide.x=Story.POINTS.exitEvac.x+1.9;s.guide.z=Story.POINTS.exitEvac.z;
  s.world.player.x=Story.POINTS.exitEvac.x;s.world.player.z=Story.POINTS.exitEvac.z;
  Story.step(s,1/60,{});
  assert.equal(s.guide.arrived,false);
  assert.equal(Story.escortArrivalCheckpoint(false,s),false);
  s.guide.waiting=false;
  Story.step(s,1/60,{});
  assert.equal(Story.escortArrivalCheckpoint(false,s),true);
  assert.equal(Story.interact(s).ok,true);
  assert.equal(Story.escortArrivalCheckpoint(false,s),false,
    'completed state must not be treated as a live autosave');
});

test('CH01 PC controller flushes physical arrival using the existing save and visible HUD warning',()=>{
  const app=fs.readFileSync(path.resolve(__dirname,'../src/story-app.js'),'utf8');
  assert.match(app,/const guideArrivedBefore=state\.guide\.arrived/);
  assert.match(app,/Story\.step\(state,step,input\)/);
  assert.match(app,/Story\.escortArrivalCheckpoint\(guideArrivedBefore,state\)/);
  assert.match(app,/persist\('안내원 안뜰 도착'\)/);
  assert.match(app,/notice\.textContent=saved\?\(reason\?/);
  assert.match(app,/notice\.classList\.toggle\('hidden',saved&&!reason\)/);
  assert.match(app,/lastAutosaveAt=state\.world\.elapsed/);
  // The same save slot is loaded after refresh; no alternate incompatible schema.
  assert.match(app,/const SAVE_KEY='veilpoint\.story\.ch01'/);
  assert.match(app,/VeilpointCheckpointRecovery\.recover\(primary,backup,Story\.recoverCheckpoint\)/);
});

test('CH01 60Hz civilian takes a longer collision-safe detour instead of freezing after leaving 7m radius',()=>{
  const s=evacuationFromLegacy();
  const wall={x:-7.75,z:-55,w:1.5,d:10.5,type:'story-container'};
  s.world.obstacles.push(wall);
  s.world.player.x=-5;s.world.player.z=-55;
  const before={x:s.guide.x,z:s.guide.z};
  assert.match(Story.situation(s).guideStatus,/우회 중/);
  for(let i=0;i<245;i++)Story.step(s,1/60,{});
  // The physical path requires an intermediate move away from the player.
  assert.ok(Math.hypot(s.guide.x-before.x,s.guide.z-before.z)>3,
    'guide must advance around the end of the obstacle');
  const saved=Story.serialize(s);
  const restored=Story.restore(saved);
  restored.world.obstacles.push({...wall});
  assert.equal(restored.guide.arrived,false);
  assert.equal(Story.serialize(restored),saved);
  // Save/restore must not reset the live physical route or lose the escort.
  for(let i=0;i<60;i++){Story.step(s,1/60,{});Story.step(restored,1/60,{});}
  assert.ok(Math.abs(s.guide.x-restored.guide.x)<1e-6);
  assert.ok(Math.abs(s.guide.z-restored.guide.z)<1e-6);
  for(let i=0;i<540;i++)Story.step(restored,1/60,{});
  assert.ok(Math.hypot(restored.guide.x-restored.world.player.x,
    restored.guide.z-restored.world.player.z)<2.4,
    'guide must reunite by walking rather than teleporting through collision');
});

test('CH01 physically blocked escort continues moving even when temporarily over 7m apart',()=>{
  const s=evacuationFromLegacy();
  s.world.player.x=-2;s.world.player.z=-55;
  s.world.obstacles.push({x:-6,z:-55,w:1.5,d:9.5,type:'story-container'});
  const initial={x:s.guide.x,z:s.guide.z};
  assert.ok(Math.hypot(s.guide.x-s.world.player.x,s.guide.z-s.world.player.z)>7);
  assert.match(Story.situation(s).guideStatus,/우회 중/);
  for(let i=0;i<120;i++)Story.step(s,1/60,{});
  assert.ok(Math.hypot(s.guide.x-initial.x,s.guide.z-initial.z)>1.5,
    'a locally obstructed guide should move around the barrier without remote teleportation');
});

test('CH01 guide does not chase a distant player across unobstructed ground',()=>{
  const s=evacuationFromLegacy();
  s.world.player.x=-2.5;s.world.player.z=-55;
  const before={x:s.guide.x,z:s.guide.z};
  for(let i=0;i<120;i++)Story.step(s,1/60,{});
  assert.equal(s.guide.x,before.x);
  assert.equal(s.guide.z,before.z);
  assert.match(Story.situation(s).guideStatus,/거리 이탈/);
});
