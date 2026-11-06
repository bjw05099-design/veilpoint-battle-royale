'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const Story=require('../src/story-slice.js');

function go(state,id){
  state.world.player.x=Story.POINTS[id].x;
  state.world.player.z=Story.POINTS[id].z;
}
function verificationRoute(){
  const state=Story.createState();
  go(state,'terminal');assert.equal(Story.interact(state).ok,true);
  for(const bot of state.world.bots)for(let n=0;n<2;n++){
    state.world.player.yaw=Math.atan2(bot.x-state.world.player.x,-(bot.z-state.world.player.z));
    state.world.player.pitch=0;
    state.world.elapsed+=.21;
    assert.equal(Story.fire(state).hit,true);
  }
  for(const id of ['recordA','recordB']){
    go(state,id);assert.equal(Story.interact(state).ok,true);
  }
  go(state,'decision');assert.equal(Story.interact(state).ok,true);
  assert.equal(Story.choose(state,'verification').ok,true);
  return state;
}

test('CH01 east gate explicitly rejects an early E press without advancing or completing the 60Hz world',()=>{
  const state=verificationRoute();
  go(state,'exitVerify');
  assert.equal(Story.nearest(state)?.id,'exitVerify');
  const before=state.world.elapsed;
  const blocked=Story.interact(state);
  assert.deepEqual(blocked,{ok:false,reason:'awaiting_clearance'});
  assert.equal(state.world.elapsed,before);
  assert.equal(state.phase,'exit');
  assert.equal(state.world.status,'playing');
  assert.match(state.message,/개방 확인 필요/);
  assert.match(state.subtitle,/개방 작업/);
  assert.equal(Story.situation(state).eastGateOpen,false);
  assert.ok(Story.situation(state).eastGateRemainingSeconds>0);
  assert.equal(Story.missionTasks(state).find(x=>x.id==='exit').status,'blocked');
  const raw=Story.serialize(state),restored=Story.restore(raw);
  assert.equal(Story.serialize(restored),raw);
  assert.equal(Story.interact(restored).reason,'awaiting_clearance');
  assert.equal(restored.world.elapsed,before);
});

test('CH01 fixed-step gate completion resumes from disk without granting a phantom early exit',()=>{
  const state=verificationRoute();
  go(state,'exitVerify');
  const before=Story.serialize(state);
  const resumed=Story.restore(before);
  for(let tick=0;tick<180;tick++){
    Story.step(state,1/60,{});
    Story.step(resumed,1/60,{});
  }
  assert.equal(Story.serialize(state),Story.serialize(resumed),
    'time and route collision are deterministic across checkpoint replay');
  assert.equal(Story.situation(resumed).eastGateOpen,false);
  assert.equal(Story.interact(resumed).reason,'awaiting_clearance');
  for(let tick=0;tick<360;tick++)Story.step(resumed,1/60,{});
  assert.equal(Story.situation(resumed).eastGateOpen,true);
  assert.equal(Story.missionTasks(resumed).find(x=>x.id==='exit').status,'available');
  assert.equal(Story.nearest(resumed)?.id,'exitVerify');
  assert.equal(Story.interact(resumed).event,'exitVerify');
  assert.equal(resumed.phase,'complete');
  assert.equal(resumed.world.status,'won');
});

test('CH01 Windows keyboard HUD uses actual locked east gate deadline, no false E prompt',()=>{
  const app=fs.readFileSync(path.resolve(__dirname,'../src/story-app.js'),'utf8');
  assert.match(app,/nearby\.id==='exitVerify'&&!situation\.eastGateOpen/);
  assert.match(app,/동쪽 통제문 개방 대기/);
  assert.match(app,/Math\.ceil\(situation\.eastGateRemainingSeconds\)/);
  assert.match(app,/nearby\.id==='exitVerify'\s*\?interactPrompt/);
  assert.match(app,/guide_not_at_muster','awaiting_clearance'\]\.includes\(result\.reason\)\)updateHud/);
  assert.match(app,/Story\.step\(state,step,input\)/);
});
