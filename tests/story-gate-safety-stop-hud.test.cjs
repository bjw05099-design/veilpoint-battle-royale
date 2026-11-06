'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Story=require('../src/story-slice.js');

function movingGate() {
  const state=Story.createState();
  state.world.player.x=0;state.world.player.z=-18;
  assert.equal(Story.interact(state).ok,true);
  for(const bot of state.world.bots){bot.health=0;bot.alive=false;}
  state.combat.cleared=true;
  state.phase='exit';
  state.choice='verification';
  state.found=['recordA','recordB'];
  state.gateClearanceDuration=8;
  state.gateReadyAt=8;
  state.world.elapsed=0;
  return state;
}

test('CH01 blocked motor publishes a real safety stop, not a countdown that appears to advance',()=>{
 const state=movingGate();
 const gate=state.world.obstacles.find(o=>o.routeId==='east-checkpoint');
 state.world.player.x=33.9;state.world.player.z=-53;
 const beforeDeadline=state.gateReadyAt;
 Story.step(state,1/60,{});
 const situation=Story.situation(state);
 assert.equal(state.gateObstructed,true);
 assert.equal(situation.eastGateObstructed,true);
 assert.equal(situation.eastGateOpen,false);
 assert.ok(situation.eastGateRemainingSeconds>0);
 assert.match(situation.route,/안전 정지/);
 assert.equal(gate.x,27,'swept collision freezes the actual world gate');
 assert.ok(state.gateReadyAt>beforeDeadline,'the motor clock waits while the travel is obstructed');
 assert.equal(Story.missionTasks(state).find(t=>t.id==='exit').status,'blocked');
 state.world.player.x=42;
 Story.step(state,1/60,{});
 assert.equal(Story.situation(state).eastGateObstructed,false);
 assert.ok(gate.x<27,'physical motor resumes after the corridor clears');
 const saved=Story.serialize(state),restored=Story.restore(saved);
 assert.equal(Story.serialize(restored),saved);
 for(let tick=0;tick<120;tick++) {Story.step(state,1/60,{});Story.step(restored,1/60,{});}
 assert.equal(Story.serialize(state),Story.serialize(restored),
  'blocking and recovery cannot introduce hidden non-deterministic save state');
});

test('CH01 early east exit remains blocked with an actionable obstruction subtitle',()=>{
 const state=movingGate();
 state.gateObstructed=true;
 state.world.player.x=Story.POINTS.exitVerify.x;
 state.world.player.z=Story.POINTS.exitVerify.z;
 assert.equal(Story.nearest(state)?.id,'exitVerify');
 assert.deepEqual(Story.interact(state),{ok:false,reason:'awaiting_clearance'});
 assert.match(state.message,/안전 정지/);
 assert.match(state.subtitle,/이동 경로/);
 assert.equal(state.phase,'exit');
 assert.equal(Story.situation(state).eastGateOpen,false);
});

test('Windows CH01 HUD uses authoritative interlock and resumes a real E prompt only on clearance',()=>{
 const app=fs.readFileSync(path.resolve(__dirname,'../src/story-app.js'),'utf8');
 assert.match(app,/situation\.eastGateObstructed\?' · 통제문 안전 정지/);
 assert.match(app,/nearby\.id==='exitVerify'&&!situation\.eastGateOpen/);
 assert.match(app,/situation\.eastGateObstructed\s*\?\s*'동쪽 통제문 안전 정지/);
 assert.match(app,/Math\.ceil\(situation\.eastGateRemainingSeconds\)/);
 assert.match(app,/nearby\.id==='exitVerify'\s*\?interactPrompt/);
 assert.match(app,/Story\.step\(state,step,input\)/);
});
