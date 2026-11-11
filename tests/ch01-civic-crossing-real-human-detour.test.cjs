'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Civic=require('../src/ch01-civic-recovery.js');
const Story=require('../src/story-slice.js');

function assisted(){
 const state=Civic.initial();
 state.disrupted=true;
 state.assisted=true;
 return state;
}
test('a CH01 resident chooses a clear public footpath around a physically present neighbor',()=>{
 const human={x:4.4,z:-16},before=assisted();
 const result=Civic.step(before,{disruption:true,player:{x:50,z:50},
  pedestrians:[human],blocked:()=>false});
 assert.equal(result.tick,1);
 assert.equal(result.civilian.x,2,'the resident moves sideways before walking into another person');
 assert.ok(result.civilian.z<-16&&result.civilian.z>=-18.4,
  'the 60Hz step is small and remains within the fictional public crossing');
 assert.deepEqual(human,{x:4.4,z:-16},'the crossing does not control other people');
 assert.equal(before.civilian.z,-16,'V1 checkpoint objects are not mutated');
});
test('no bystander leaves the ordinary straight crossing free to use',()=>{
 const current=assisted();
 const next=Civic.step(current,{disruption:true,player:{x:50,z:50},blocked:()=>false});
 assert.ok(next.civilian.x>2);
 assert.equal(next.civilian.z,-16);
 assert.deepEqual(Civic.restore(JSON.parse(JSON.stringify(next))),next);
});
test('an occupied alternative footpath never permits walking through an actual body',()=>{
 const current=assisted(),bodies=[
  {x:4.4,z:-16},{x:2,z:-18.4},{x:2,z:-13.6}
 ];
 const result=Civic.step(current,{disruption:true,player:{x:50,z:50},
  pedestrians:bodies,blocked:()=>false});
 assert.deepEqual(result.civilian,current.civilian,
  'the resident waits until an authentic local route is free');
 assert.throws(()=>Civic.step(current,{pedestrians:[] .concat(Array(33).fill({x:2,z:1}))}),/invalid_local_pedestrians/);
});
test('the original playable CH01 60Hz step reads real nearby characters without save fields',()=>{
 const s=Story.createState();
 s.phase='records';s.combat.started=true;s.combat.cleared=true;
 s.civicCrossing.disrupted=true;s.civicCrossing.assisted=true;
 const old=Object.keys(s.civicCrossing).sort(),beforeTick=s.civicCrossing.tick;
 // This companion is one of the scene's genuine shared collidable actors.
 s.kimJiyoon.x=4.4;s.kimJiyoon.z=-16;
 s.world.player.x=50;s.world.player.z=50;
 Story.step(s,1/60,{});
 assert.equal(s.civicCrossing.tick,beforeTick+1);
 assert.deepEqual(Object.keys(s.civicCrossing).sort(),old);
 assert.equal(s.world.civicCrossing.x,s.civicCrossing.civilian.x);
 assert.equal(s.world.civicCrossing.z,s.civicCrossing.civilian.z);
});
