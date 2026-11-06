'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Story=require('../src/story-slice.js');
const Sim=require('../src/simulation.js');

function legacyEscort(waiting){
 const s=Story.createState();
 s.phase='exit';s.choice='evacuation';s.musterConfirmed=true;
 s.guide.active=true;s.guide.waiting=waiting;
 s.combat.started=true;s.combat.cleared=true;
 s.world.bots=[
  {id:0,x:0,z:-28,angle:Math.PI,health:0,alive:false,shots:12},
  {id:1,x:15,z:-34,angle:Math.PI,health:0,alive:false,shots:12},
  {id:2,x:-15,z:-34,angle:Math.PI,health:0,alive:false,shots:12}
 ];
 return s;
}

test('CH01 wide new scenery cannot strand a valid older escort save',()=>{
 for(const waiting of [false,true]){
  const original=legacyEscort(waiting);
  const raw=Story.serialize(original);
  const oldPose={x:original.guide.x,z:original.guide.z};
  const playerPose={x:original.world.player.x,z:original.world.player.z};
  // Emulate a large newly solid building absent when the checkpoint was made.
  // This is injected only into the authored match loaded from disk.
  const newWall={x:oldPose.x,z:oldPose.z,w:12,d:12,type:'story-building'};
  const newMatch=Sim.newMatch;
  Sim.newMatch=(...args)=>{
   const world=newMatch(...args);
   world.obstacles.push({...newWall});
   return world;
  };
  try{
   const resumed=Story.restore(raw);
   const distance=Math.hypot(resumed.guide.x-oldPose.x,resumed.guide.z-oldPose.z);
   assert.ok(distance>6&&distance<=13,
    'checkpoint-only recovery finds the nearest safe bounded ring');
   assert.equal(Sim.blocked(resumed.guide.x,resumed.guide.z,.55,resumed.world.obstacles),false);
   assert.deepEqual({x:resumed.world.player.x,z:resumed.world.player.z},playerPose,
    'recovery never moves the captain or rewinds the route');
   assert.equal(resumed.guide.waiting,waiting);
   assert.equal(resumed.guide.active,true);
   assert.equal(resumed.phase,'exit');
   assert.match(resumed.message,/동행 안내원/);
   const persisted=Story.serialize(resumed);
   const replay=Story.restore(persisted);
   assert.equal(Story.serialize(replay),persisted,
    'a second reload must not relocate an already safe guide');
   Story.step(resumed,1/60,{});
   Story.step(replay,1/60,{});
   assert.equal(Story.serialize(replay),Story.serialize(resumed),
    '60Hz state after recovery remains deterministic');
  }finally{
   Sim.newMatch=newMatch;
  }
 }
});

test('CH01 ordinary valid companion checkpoints keep their exact positions',()=>{
 const state=legacyEscort(true);
 const raw=Story.serialize(state);
 const resumed=Story.restore(raw);
 assert.equal(Story.serialize(resumed),raw);
 assert.equal(resumed.guide.x,state.guide.x);
 assert.equal(resumed.guide.z,state.guide.z);
});
