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
  assert.match(app,/Story\.recoverCheckpoint\(primary,backup\)/);
});
