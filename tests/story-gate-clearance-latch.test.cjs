'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Story=require('../src/story-slice.js');
const Sim=require('../src/simulation.js');
const go=(s,id)=>{s.world.player.x=Story.POINTS[id].x;s.world.player.z=Story.POINTS[id].z;};
function ready(){
 const s=Story.createState();go(s,'terminal');assert.equal(Story.interact(s).ok,true);
 for(const b of s.world.bots)for(let i=0;i<2;i++){
  s.world.player.yaw=Math.atan2(b.x-s.world.player.x,-(b.z-s.world.player.z));
  s.world.player.pitch=0;s.world.elapsed+=.21;assert.equal(Story.fire(s).hit,true);
 }
 for(const id of ['recordA','recordB']){go(s,id);assert.equal(Story.interact(s).ok,true);}
 return s;
}
test('authorized CH01 gate keeps its physical travel duration when relay is disconnected and restored',()=>{
 const s=ready();go(s,'relay');assert.equal(Story.interact(s).ok,true);
 go(s,'decision');Story.interact(s);assert.equal(Story.choose(s,'verification').ok,true);
 assert.equal(s.gateClearanceDuration,4);
 const deadline=s.gateReadyAt;
 for(let i=0;i<60;i++)Story.step(s,1/60,{});
 const gate=()=>s.world.obstacles.find(o=>o.routeId==='east-checkpoint').x;
 const before=gate();
 go(s,'relay');assert.equal(Story.interact(s).ok,true);
 assert.equal(s.relayRestored,false);
 assert.equal(s.gateReadyAt,deadline);
 assert.equal(s.gateClearanceDuration,4);
 assert.equal(gate(),before,'switching off radio cannot snap moving gate geometry');
 const saved=Story.serialize(s),reloaded=Story.restore(saved);
 assert.equal(Story.serialize(reloaded),saved);
 assert.equal(reloaded.world.obstacles.find(o=>o.routeId==='east-checkpoint').x,before);
 const replay=Story.restore(saved);
 for(let i=0;i<185;i++){Story.step(reloaded,1/60,{});Story.step(replay,1/60,{});}
 assert.equal(Story.serialize(reloaded),Story.serialize(replay));
 assert.equal(Story.situation(reloaded).eastGateOpen,true);
 assert.equal(reloaded.world.obstacles.find(o=>o.routeId==='east-checkpoint').x,15);
 const br=Sim.newMatch(42,0);
 assert.equal(br.gateClearanceDuration,undefined);
});
test('legacy gate checkpoint without latched duration stays loadable; forged duration is rejected',()=>{
 const s=ready();go(s,'decision');Story.interact(s);Story.choose(s,'verification');
 const old=JSON.parse(Story.serialize(s));delete old.gateClearanceDuration;
 const restored=Story.restore(JSON.stringify(old));
 assert.equal(restored.gateClearanceDuration,8);
 const forged=JSON.parse(Story.serialize(s));forged.gateClearanceDuration=0;
 assert.throws(()=>Story.restore(JSON.stringify(forged)),RangeError);
 forged.gateClearanceDuration=Infinity;
 assert.throws(()=>Story.restore(JSON.stringify(forged)),RangeError);
});
