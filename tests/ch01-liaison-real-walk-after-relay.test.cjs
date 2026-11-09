'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Story=require('../src/story-slice.js');
const Sim=require('../src/simulation.js');

function at(s,id){const mark=Story.POINTS[id];s.world.player.x=mark.x;s.world.player.z=mark.z;}
function restoreRelay(){
 const s=Story.createState();
 at(s,'terminal');assert.equal(Story.interact(s).ok,true);
 for(const bot of [...s.world.bots]){
  for(let shot=0;shot<2;shot++){
   s.world.player.yaw=Math.atan2(bot.x-s.world.player.x,-(bot.z-s.world.player.z));
   s.world.player.pitch=0;s.world.elapsed+=.21;
   assert.equal(Story.fire(s).ok,true);
  }
 }
 assert.equal(s.phase,'records');
 at(s,'liaisonAssist');
 assert.equal(Story.interact(s).event,'onsite_liaison_relay');
 assert.equal(s.relayRestored,true);
 return s;
}

test('Jo Hyunji walks at finite 60Hz after witnessed relay restoration, not before',()=>{
 const s=Story.createState();
 const begin=s.world.elapsed;
 for(let i=0;i<160;i++)Story.step(s,1/60,{});
 assert.equal(s.liaisonZ,-39);
 assert.equal(s.world.liaison,null);
 assert.ok(s.world.elapsed>begin);
 const progressed=restoreRelay();
 assert.equal(progressed.liaisonZ,-39);
 assert.equal(progressed.world.liaison.z,-39);
 // A player standing on Jo's physical start point makes her wait rather
 // than forcing an actor through the player capsule.
 for(let i=0;i<30;i++)Story.step(progressed,1/60,{});
 assert.equal(progressed.liaisonZ,-39,'overlapping player prevents forced movement');
 progressed.world.player.x=0;progressed.world.player.z=-45;
 for(let i=0;i<480;i++)Story.step(progressed,1/60,{});
 assert.equal(progressed.liaisonZ,-46);
 assert.equal(progressed.world.liaison.z,-46);
 assert.equal(progressed.world.liaison.x,12);
 assert.equal(Sim.blocked(12,-46,.55,progressed.world.obstacles),false);
});

test('movement is reflected in checkpoint, exact restored render pose and deterministic replay',()=>{
 const s=restoreRelay();
 s.world.player.x=0;s.world.player.z=-45;
 for(let i=0;i<140;i++)Story.step(s,1/60,{});
 assert.ok(s.liaisonZ<-39&&s.liaisonZ>-46);
 const saved=Story.serialize(s),copy=Story.restore(saved);
 assert.equal(copy.liaisonZ,s.liaisonZ);
 assert.equal(copy.world.liaison.z,s.liaisonZ);
 assert.equal(Story.serialize(copy),saved);
 const second=Story.restore(saved);
 for(let i=0;i<450;i++){Story.step(copy,1/60,{});Story.step(second,1/60,{});}
 assert.equal(Story.serialize(copy),Story.serialize(second));
 assert.equal(copy.liaisonZ,-46);
});

test('old v2 saves remain readable, forged remote Jo positions are rejected',()=>{
 const s=restoreRelay();
 s.world.player.x=0;s.world.player.z=-45;
 const old=JSON.parse(Story.serialize(s));
 delete old.liaisonZ;
 const prior=Story.restore(JSON.stringify(old));
 assert.equal(prior.liaisonZ,-39);
 assert.equal(prior.world.liaison.z,-39);
 // A line may later lose power without walking its actual people backwards.
 // A fabricated completed walk without the recorded encounter remains invalid.
 const forged={...old,liaisonZ:-45,relayRestored:false,
  combat:{...old.combat,cleared:false}};
 assert.throws(()=>Story.restore(JSON.stringify(forged)),RangeError);
 assert.throws(()=>Story.restore(JSON.stringify({...old,liaisonZ:-100})),RangeError);
 assert.throws(()=>Story.restore(JSON.stringify({...old,liaisonZ:NaN})),RangeError);
});
