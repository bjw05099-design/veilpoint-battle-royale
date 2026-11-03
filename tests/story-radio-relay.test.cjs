'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Story=require('../src/story-slice.js');
const go=(s,id)=>{s.world.player.x=Story.POINTS[id].x;s.world.player.z=Story.POINTS[id].z;};
function cleared(){
 const s=Story.createState();go(s,'terminal');assert.equal(Story.interact(s).ok,true);
 for(const b of s.world.bots){for(let i=0;i<2;i++){
  s.world.player.yaw=Math.atan2(b.x-s.world.player.x,-(b.z-s.world.player.z));
  s.world.player.pitch=0;s.world.elapsed+=.21;
  assert.equal(Story.fire(s).hit,true);
 }}
 assert.equal(s.phase,'records');return s;
}
test('optional CH01 radio objective becomes reachable after records and changes gate clearance timing',()=>{
 const s=cleared();assert.equal(Story.markers(s).length,3);
 go(s,'recordA');Story.interact(s);go(s,'recordB');Story.interact(s);
 assert.equal(Story.markers(s).some(m=>m.id==='relay'),true);
 s.world.player.x=8;s.world.player.z=-34;s.world.player.yaw=0;
 for(let i=0;i<60;i++)Story.step(s,1/60,{forward:true});
 assert.equal(Story.nearest(s).id,'relay');
 assert.deepEqual(Story.interact(s),{ok:true,event:'relay',phase:'records'});
 assert.equal(s.relayRestored,true);
 assert.equal(Story.markers(s).some(m=>m.id==='relay'),false);
 assert.match(Story.situation(s).radio,/4초/);
 const before=Story.serialize(s),restored=Story.restore(before);
 assert.equal(restored.relayRestored,true);
 assert.equal(Story.serialize(restored),before);
 go(restored,'decision');Story.interact(restored);
 Story.choose(restored,'verification');
 assert.ok(Math.abs(restored.gateReadyAt-restored.world.elapsed-4)<1e-8);
 const gate=()=>restored.world.obstacles.find(o=>o.routeId==='east-checkpoint');
 const closedX=gate().x;
 for(let i=0;i<120;i++)Story.step(restored,1/60,{});
 assert.ok(gate().x<closedX,'gate motor must physically travel');
 assert.equal(Story.situation(restored).eastGateOpen,false);
 for(let i=0;i<121;i++)Story.step(restored,1/60,{});
 assert.equal(Story.situation(restored).eastGateOpen,true);
 go(restored,'exitVerify');assert.equal(Story.interact(restored).ok,true);
 assert.equal(Story.debrief(restored).emergencyRadioRestored,true);
});
test('old checkpoints default radio off and forged early restoration is rejected',()=>{
 const s=cleared();const data=JSON.parse(Story.serialize(s));
 delete data.relayRestored;
 const old=Story.restore(JSON.stringify(data));
 assert.equal(old.relayRestored,false);
 go(old,'decision');Story.interact(old);Story.choose(old,'evacuation');
 assert.equal(Story.situation(old).eastGateOpen,false);
 const forged=JSON.parse(Story.serialize(Story.createState()));forged.relayRestored=true;
 assert.throws(()=>Story.restore(JSON.stringify(forged)),RangeError);
 forged.relayRestored='true';assert.throws(()=>Story.restore(JSON.stringify(forged)),RangeError);
 const noRadio=cleared();go(noRadio,'decision');Story.interact(noRadio);Story.choose(noRadio,'evacuation');
 assert.equal(Story.debrief(noRadio),null);
});