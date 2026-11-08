'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Story=require('../src/story-slice.js');
function inEscalation(){
 const state=Story.createState();
 state.world.player.x=Story.POINTS.terminal.x;
 state.world.player.z=Story.POINTS.terminal.z;
 assert.equal(Story.interact(state).phase,'engagement');
 // Observer fixture well away from the authored harbor scene: no fight outcome
 // is fabricated and the local worker remains autonomous.
 state.world.player.x=-120;
 state.world.player.z=110;
 return state;
}
test('local harbor worker walks to adjacent pedestrian shelter during active encounter',()=>{
 const state=inEscalation();
 const before={...state.worker};
 assert.equal(before.z,-12);
 for(let i=0;i<850;i++)Story.step(state,1/60,{});
 assert.equal(state.phase,'engagement','the worker is not a combat completion trigger');
 assert.ok(state.worker.x>=before.x,'movement follows the existing sidewalk');
 assert.ok(state.worker.z>-12,'the worker moves during the incident, not after a clearance prompt');
 assert.ok(state.worker.z<=-8,'shelter remains a nearby physical pedestrian lane');
 assert.equal(state.workerInterviewed,false,'civilian movement is never tied to an interview');
 assert.equal(Story.markers(state).some(m=>m.id==='harborWorker'),false,
   'no new mandatory dialogue, collection or remote marker in combat');
 const checkpoint=Story.serialize(state);
 assert.equal(Story.serialize(Story.restore(checkpoint)),checkpoint,
   'real mid-encounter civilian positions survive the v2 checkpoint byte-for-byte');
});
test('a solid crossing barrier prevents civilian shelter movement without a teleport',()=>{
 const state=inEscalation();
 // The test obstacle exists only in the running world; no new mission prop
 // or checkpoint object is introduced into the map.
 state.worker.x=28;
 state.worker.z=-12;
 state.world.obstacles.push({x:28,z:-10,w:4,d:1.5,h:2,type:'test-pedestrian-barrier'});
 for(let i=0;i<240;i++)Story.step(state,1/60,{});
 assert.equal(state.phase,'engagement');
 assert.ok(state.worker.z<=-11.0,'the worker cannot walk through the authored solid');
 assert.ok(state.worker.z>=-12,'the worker never jumps backwards or teleports');
});
