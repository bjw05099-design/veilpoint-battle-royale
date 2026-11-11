'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Story=require('../src/story-slice.js');
const C=require('../src/story-consequences.js');

function enteredLane(){
 const state=Story.createState();
 state.phase='records';
 state.combat.started=true;
 state.combat.cleared=true;
 state.worker.x=28;
 state.worker.z=-8;
 return state;
}
test('CH01 causal debrief records only the physically reached worker side lane',()=>{
 const state=enteredLane(),unchanged=JSON.stringify(state);
 const timeline=C.fromMission(state);
 assert.ok(timeline.events.includes(C.EVENTS.WORKER_REACHED_SIDE_LANE));
 assert.equal(timeline.events.filter(e=>e===C.EVENTS.WORKER_REACHED_SIDE_LANE).length,1);
 assert.equal(timeline.events.includes(C.EVENTS.LOCAL_GUIDE),false);
 assert.equal(timeline.events.includes(C.EVENTS.EXIT),false);
 assert.equal(JSON.stringify(state),unchanged,'read-only debrief does not mutate V2 game state');
 assert.deepEqual(C.restoreTimeline(JSON.parse(JSON.stringify(timeline))),timeline);
 assert.equal(C.advance(timeline,C.EVENTS.WORKER_REACHED_SIDE_LANE),timeline);
});
test('the optional lane event never arises from a remote or still moving worker',()=>{
 const state=enteredLane();
 for(const [x,z] of [[28,-12],[26,-8],[28,-7],[Infinity,-8],[28,NaN]]){
  state.worker.x=x;state.worker.z=z;
  assert.equal(C.fromMission(state).events.includes('worker_reached_side_lane'),false);
 }
 state.worker.x=28;state.worker.z=-8;state.combat.cleared=false;
 assert.equal(C.fromMission(state).events.includes('worker_reached_side_lane'),false);
 state.combat.cleared=true;state.combat.started=false;
 assert.equal(C.fromMission(state).events.includes('worker_reached_side_lane'),false);
});
test('a worker lane arrival cannot be restored before contact loss',()=>{
 const prior=C.advance(C.advance(C.newTimeline(),C.EVENTS.ARRIVED),C.EVENTS.ESCALATION);
 assert.throws(()=>C.advance(prior,C.EVENTS.WORKER_REACHED_SIDE_LANE),/prerequisite/);
 const now=C.advance(prior,C.EVENTS.CONTACT_LOST);
 const reached=C.advance(now,C.EVENTS.WORKER_REACHED_SIDE_LANE);
 assert.deepEqual(C.restoreTimeline(JSON.parse(JSON.stringify(reached))),reached);
});
