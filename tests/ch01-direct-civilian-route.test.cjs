'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Story=require('../src/story-slice.js');
const go=(state,point)=>{state.world.player.x=point.x;state.world.player.z=point.z;};
function postDisruption(){
  const state=Story.createState();
  go(state,Story.POINTS.terminal);
  assert.equal(Story.interact(state).phase,'engagement');
  // Existing test fixture represents a completed encounter, not a new
  // authored instant-win interaction available to real players.
  for(const actor of state.world.bots){actor.alive=false;actor.health=0;}
  state.combat.cleared=true;
  state.phase='records';
  return state;
}
test('CH01 evacuation may follow an observed local coordinator without console or documents',()=>{
  const s=postDisruption();
  assert.deepEqual(s.found,[]);
  assert.equal(s.deploymentReviewed,false);
  assert.equal(s.dispatchReviewed,false);
  assert.equal(Story.markers(s).some(m=>m.id==='coordinatorRequest'),false,
    'a distant coordinator is not a magic global objective');
  go(s,Story.POINTS.coordinatorRequest);
  assert.equal(Story.markers(s).some(m=>m.id==='coordinatorRequest'),true);
  assert.equal(Story.nearest(s)?.id,'coordinatorRequest');
  const selected=Story.interact(s);
  assert.deepEqual(selected,{ok:true,event:'coordinatorRequest',phase:'exit'});
  assert.equal(s.choice,'evacuation');
  assert.equal(s.phase,'exit');
  assert.deepEqual(s.found,[]);
  assert.equal(s.musterConfirmed,false,'local conversation does not fabricate a muster confirmation');
  assert.equal(s.guide.active,false,'the guide remains an optional, physical follow-up');
  assert.equal(s.dispatchReviewed,false);
  assert.equal(s.deploymentReviewed,false);
  assert.match(s.subtitle,/유수프.*남쪽 통로/);
  assert.equal(Story.markers(s).some(m=>m.id==='coordinatorRequest'),false);
  const saved=Story.serialize(s);
  const restored=Story.restore(saved);
  assert.equal(restored.phase,'exit');
  assert.equal(restored.choice,'evacuation');
  assert.equal(Story.serialize(restored),saved,'no save generation or schema changes');
  go(restored,Story.POINTS.exitEvac);
  assert.equal(Story.interact(restored).phase,'complete',
    'the core escape path is not forced through repeated paperwork');
});
test('direct civilian route is not offered before the disruption or after choosing another route',()=>{
  const s=Story.createState();
  go(s,Story.POINTS.coordinatorRequest);
  assert.equal(Story.markers(s).some(m=>m.id==='coordinatorRequest'),false);
  const post=postDisruption();
  go(post,Story.POINTS.decision);
  assert.equal(Story.interact(post).phase,'decision');
  go(post,Story.POINTS.coordinatorRequest);
  assert.equal(Story.nearest(post)?.id,'coordinatorRequest');
  assert.equal(Story.interact(post).phase,'exit');
  assert.equal(post.choice,'evacuation');
  // Still no compulsory record sidequest, extra travel marker or new field.
  assert.deepEqual(Story.missionTasks(post).map(task=>task.id),['muster','guide','aid','exit']);
  const old=Story.restore(JSON.stringify({
    version:1,phase:'records',found:[],choice:null,
    player:{x:0,z:-41,yaw:0,pitch:0,stamina:100},elapsed:12
  }));
  assert.equal(old.phase,'records');
  assert.equal(Story.markers(old).some(m=>m.id==='decision'),true,
    'historic console route remains usable by returning players');
});
