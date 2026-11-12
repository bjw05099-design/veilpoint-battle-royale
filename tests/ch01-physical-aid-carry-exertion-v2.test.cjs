'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Story=require('../src/story-slice.js');
const at=(s,id)=>{s.world.player.x=Story.POINTS[id].x;s.world.player.z=Story.POINTS[id].z;};
function actualSupply(){
 const s=Story.createState();
 at(s,'terminal');assert.equal(Story.interact(s).ok,true);
 for(const adversary of s.world.bots)for(let i=0;i<2;i++){
  s.world.player.yaw=Math.atan2(adversary.x-s.world.player.x,
   -(adversary.z-s.world.player.z));
  s.world.player.pitch=0;s.world.elapsed+=.21;
  assert.equal(Story.fire(s).hit,true);
 }
 assert.equal(s.phase,'records');
 at(s,'decision');assert.equal(Story.interact(s).ok,true);
 assert.equal(Story.choose(s,'evacuation').ok,true);
 at(s,'aidPickup');assert.deepEqual(Story.interact(s),
  {ok:true,event:'aidPickup',phase:'exit'});
 assert.equal(s.world.carryingAid,true);
 s.world.player.x=-7;s.world.player.z=-47;s.world.player.yaw=0;
 s.world.player.stamina=65;
 return s;
}
function tick(s,input,count=60){for(let i=0;i<count;i++)Story.step(s,1/60,input);}

test('real CH01 physical supply pickup consumes stamina while MOVING, not just pressing Sprint',()=>{
 const carried=actualSupply(),without=actualSupply();
 without.world.carryingAid=false;without.aidPickedUp=false;
 const beginning=carried.world.player.stamina;
 tick(carried,{forward:true,sprint:true});
 tick(without,{forward:true});
 assert.ok(carried.world.player.z<-47.5,'crate wearer actually walks along the 60Hz corridor');
 assert.ok(carried.world.player.stamina<beginning,
  'sustained loaded travel has physically measured exertion despite disabled sprint');
 assert.ok(without.world.player.stamina>beginning,
  'ordinary unladen pedestrian pace still recovers stamina');
 assert.ok(carried.world.player.z>without.world.player.z,
  'a bulky physical crate continues to limit distance covered');
 assert.equal(carried.phase,'exit');
});

test('pausing an actual carried crate at rest anywhere recovers stamina, without a new save flag',()=>{
 const s=actualSupply();tick(s,{forward:true},60);
 const afterWalk=s.world.player.stamina,raw=Story.serialize(s);
 assert.ok(afterWalk<65);
 const restored=Story.restore(raw);
 assert.equal(Story.serialize(restored),raw,'V2 checkpoints encode the entire real exertion state');
 tick(restored,{},60);
 assert.ok(restored.world.player.stamina>afterWalk,
  'actual rest rather than shade or arbitrary furniture restores exertion');
 assert.equal(restored.world.carryingAid,true);
 const again=Story.serialize(restored);
 assert.equal(Story.serialize(Story.restore(again)),again);
});

test('stamina and speed for loaded 60Hz footsteps are reproducible across a restored checkpoint',()=>{
 const s=actualSupply();
 tick(s,{forward:true},45);
 const raw=Story.serialize(s),a=Story.restore(raw),b=Story.restore(raw);
 for(let i=0;i<120;i++){
  const input=i<55?{forward:true,crouch:true}:i<90?{}:{right:true};
  Story.step(a,1/60,input);Story.step(b,1/60,input);
 }
 assert.equal(Story.serialize(a),Story.serialize(b));
 assert.ok(a.world.player.stamina>=0&&a.world.player.stamina<=100);
});
