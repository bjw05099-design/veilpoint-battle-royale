'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Story=require('../src/story-slice.js');
const Sim=require('../src/simulation.js');
function startConflict(){
 const state=Story.createState(),p=state.world.player;
 p.x=Story.POINTS.terminal.x;p.z=Story.POINTS.terminal.z;
 assert.equal(Story.interact(state).phase,'engagement');
 // The assertion is about civilian navigation after conflict starts, not
 // scripted combat. Disable encounter actors in this isolated unit fixture.
 for(const b of state.world.bots){b.alive=false;b.health=0;}
 state.combat.cleared=true;
 state.phase='records';
 return state;
}
test('ordinary pre-escalation worker walks; after escalation autonomously clears the public lane and stops',()=>{
 const baseline=Story.createState(),normal=baseline.worker;
 for(let n=0;n<120;n++)Story.step(baseline,1/60,{});
 assert.ok(normal.x>21&&normal.x<24,'before the incident ordinary work is uninterrupted');
 const state=startConflict(),w=state.worker,initial=w.x;
 const markers=Story.markers(state).map(m=>m.id);
 for(let n=0;n<380;n++)Story.step(state,1/60,{});
 assert.ok(w.x>initial+6,'worker reacts to a real event by leaving a repetitive work path');
 assert.ok(Math.abs(w.x-28)<.001,'worker stays at physically reachable end of existing pedestrian lane');
 assert.equal(w.direction,1);
 assert.ok(w.z>-12&&w.z< -8,'after reaching a corner the civilian starts a real sideways shelter walk');
 assert.equal(Sim.blocked(w.x,w.z,.55,state.world.obstacles),false);
 const stopped=w.x;
 for(let n=0;n<480;n++)Story.step(state,1/60,{});
 assert.equal(w.x,stopped,'civilian cannot resume a casual back-and-forth immediately after fighting');
 assert.equal(w.z,-8,'the autonomous safe-lane walk ends at the actual street, not a teleport');
 // Nearby human companion controls are intentionally optional, NOT civilian
 // investigation objectives. The original evidence, records and route marker
 // contract must remain identical as the worker moves autonomously.
 const proceduralIds=ids=>ids.filter(id=>id!=='kimControl');
 assert.deepEqual(proceduralIds(Story.markers(state).map(m=>m.id)),
  proceduralIds(markers),
  'reactive civilian movement never invents investigation or paperwork objectives');
 assert.deepEqual(Story.missionTasks(state),[],
  'optional on-site F companion controls do not add a chapter mission task');
 const checkpoint=Story.serialize(state),again=Story.restore(checkpoint);
 assert.equal(again.worker.x,28);
 assert.equal(again.worker.direction,1);
 assert.equal(Story.serialize(again),checkpoint);
});
test('worker waits before the captain body, then continues around a cleared lane with no teleport',()=>{
 const state=startConflict(),w=state.worker,p=state.world.player;
 w.x=23;w.direction=-1;
 p.x=25.5;p.z=-12;
 const before=w.x;
 for(let n=0;n<160;n++)Story.step(state,1/60,{});
 assert.ok(w.x>=before&&w.x<24.2,'worker must not clip through a person standing in the side passage');
 assert.ok(Math.hypot(w.x-p.x,w.z-p.z)>=1.4-1e-6);
 p.x=0;p.z=12;
 for(let n=0;n<300;n++)Story.step(state,1/60,{});
 assert.equal(w.x,28,'worker proceeds physically after the side passage clears');
 assert.equal(w.direction,1);
});
