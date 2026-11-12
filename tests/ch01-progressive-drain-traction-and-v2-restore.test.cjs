'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Story=require('../src/story-slice.js');
const Flood=require('../src/ch01-street-flood.js');
const Sim=require('../src/simulation.js');
function atPatch(ticks=0,cleared=false){
 const s=Story.createState();
 s.phase='records';s.combat.started=true;s.combat.cleared=true;
 s.drainClearTicks=ticks;s.drainCleared=cleared;
 s.world.bots=[];
 s.world.player.x=Flood.PATCH.x;s.world.player.z=Flood.PATCH.z;
 s.world.player.yaw=0;s.world.player.pitch=0;
 s.world.streetFlood={...Flood.PATCH,...(cleared?{cleared:true}:
   ticks?{repairProgress:ticks/Flood.CLEAR_TICKS}:{})};
 assert.equal(Sim.blocked(s.world.player.x,s.world.player.z,.85,s.world.obstacles),false);
 return s;
}
test('CH01 wet footing uses the same fractional 60Hz drain work shown by the physical scene',()=>{
 const p=Flood.PATCH;
 assert.equal(Flood.mobility('records',p.x,p.z),.72);
 assert.equal(Flood.mobility('records',p.x,p.z,{...p,repairProgress:.5}),.82);
 assert.equal(Flood.mobility('records',p.x,p.z,{...p,cleared:true}),.92);
 assert.equal(Flood.mobility('records',p.x,p.z,true),.92,'old boolean callers remain compatible');
 assert.equal(Flood.mobility('records',p.x,p.z,{...p,x:p.x+1,repairProgress:1}),.72,
   'a different surface cannot author this drain result');
 assert.equal(Flood.mobility('terminal',p.x,p.z,{...p,repairProgress:.5}),1);
});
test('actual 60Hz captain walking changes gradually during the real nearby F-drain interaction',()=>{
 const states=[atPatch(),atPatch(90),atPatch(0,true)];
 const distances=states.map(s=>{
  const before=s.world.player.z;
  Story.step(s,1/60,{forward:true});
  return Math.abs(s.world.player.z-before);
 });
 assert.ok(distances.every(x=>x>0),'all three surface states remain physically walkable');
 assert.ok(distances[0]<distances[1]&&distances[1]<distances[2],
   'real movement responds to partial work, not only an all-or-nothing flag');
 assert.equal(states[1].drainClearTicks,91,'real fixed-step work advances exactly one tick');
 assert.equal(states[1].world.streetFlood.repairProgress,91/Flood.CLEAR_TICKS);
});
test('an interrupted local drain interaction returns to existing wet footing without new V2 save fields',()=>{
 const s=atPatch(90);
 const raw=Story.serialize(s),restored=Story.restore(raw);
 assert.equal(restored.drainClearTicks,90);
 assert.equal(restored.world.streetFlood.repairProgress,.5);
 assert.equal(Story.serialize(restored),raw);
 // Walking outside the physically reachable drain cancels outstanding work.
 restored.world.player.x=Flood.PATCH.x+5;
 Story.step(restored,1/60,{});
 assert.equal(restored.drainClearTicks,0);
 assert.deepEqual(restored.world.streetFlood,Flood.PATCH);
});
