'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Story=require('../src/story-slice.js');
const Sim=require('../src/simulation.js');
function interruptedHarbor(){
 // A real legacy checkpoint remains readable with no extra required fields.
 const saved={version:1,phase:'records',found:[],choice:null,
   player:{x:20.5,z:-38,yaw:0,pitch:0,stamina:100},elapsed:15};
 const state=Story.restore(JSON.stringify(saved));
 state.awningFallen=true;
 return state;
}
test('CH01 optional awning-clearance is a physical non-document action over fixed 60Hz ticks',()=>{
 const state=interruptedHarbor();
 const marker=Story.markers(state).find(m=>m.id==='awningHandle');
 assert.ok(marker,'the player sees a nearby tangible frame');
 assert.equal(Story.interact(state).event,'awning_clear_started');
 const before=state.world.elapsed;
 Story.step(state,1/60,{});
 assert.ok(state.awningShift>0&&state.awningShift<1);
 assert.ok(state.world.elapsed>before);
 const first=state.world.obstacles.find(o=>o.routeId==='story-fallen-awning');
 assert.ok(first&&first.x>24);
 for(let i=1;i<240;i++)Story.step(state,1/60,{});
 assert.equal(state.awningShift,1);
 assert.equal(state.awningWorking,false);
 const last=state.world.obstacles.find(o=>o.routeId==='story-fallen-awning');
 assert.ok(last&&Math.abs(last.x-28.8)<1e-6,'frame stays solid instead of disappearing');
 assert.equal(Story.markers(state).some(m=>m.id==='awningHandle'),false);
 const restored=Story.restore(Story.serialize(state));
 assert.equal(restored.awningShift,1);
 assert.equal(restored.world.obstacles.find(o=>o.routeId==='story-fallen-awning').x,last.x);
});
test('paused or distant player cannot remotely move the fallen CH01 frame',()=>{
 const state=interruptedHarbor();
 assert.equal(Story.interact(state).event,'awning_clear_started');
 const before=state.awningShift;
 Story.step(state,0,{forward:true});
 assert.equal(state.awningShift,before);
 state.world.player.x=-15;state.world.player.z=0;
 for(let i=0;i<180;i++)Story.step(state,1/60,{});
 assert.equal(state.awningShift,before);
 assert.equal(Story.markers(state).some(m=>m.id==='awningHandle'),false);
 // Moving an occupied physical body must not be allowed.
 state.world.player.x=20.5;state.world.player.z=-38;
 const parked=Story.serialize(state);
 assert.equal(Story.restore(parked).awningWorking,true);
 assert.equal(Story.restore(parked).awningShift,0);
});
test('CH01 legacy saves retain original awning geometry and reject invented progress',()=>{
 const state=interruptedHarbor();
 state.awningFallen=false;
 const saved=JSON.parse(Story.serialize(state));
 delete saved.awningShift;delete saved.awningWorking;
 const restored=Story.restore(JSON.stringify(saved));
 assert.equal(restored.awningShift,0);
 assert.equal(restored.awningWorking,false);
 assert.equal(restored.awningFallen,false);
 for(const change of [
   {awningShift:1.1,awningWorking:false},
   {awningShift:0.2,awningWorking:false,awningFallen:false},
   {awningShift:1,awningWorking:true,awningFallen:true},
   {awningShift:NaN,awningWorking:true}
 ]){
  const bad={...saved,...change};
  assert.throws(()=>Story.restore(JSON.stringify(bad)),/checkpoint|invalid/i);
 }
});
