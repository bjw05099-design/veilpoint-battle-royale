'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Story=require('../src/story-slice.js');

// Real PC E and the HUD use the same nearest() physical-contact gate.
function escortAt(staff,barrier=false){
 const state=Story.createState();
 state.phase='exit';state.choice='evacuation';state.musterConfirmed=true;
 state.combat.started=true;state.combat.cleared=true;
 state.world.bots=[
  {id:0,x:0,z:-28,angle:Math.PI,health:0,alive:false,shots:12},
  {id:1,x:15,z:-34,angle:Math.PI,health:0,alive:false,shots:12},
  {id:2,x:-15,z:-34,angle:Math.PI,health:0,alive:false,shots:12}];
 const m=Story.POINTS[staff];
 state.guide={active:true,arrived:false,released:false,waiting:true,x:m.x+2,z:m.z};
 state.world.player.x=m.x+1;state.world.player.z=m.z+1;
 if(barrier)state.world.obstacles.push({x:m.x+1,z:m.z,w:.3,d:.3,type:'story-container'});
 return state;
}

for(const staff of ['guideRelease','guideTransfer']){
 test('CH01 '+staff+' requires unobstructed guide-to-staff contact for the E prompt and release',()=>{
  const clear=escortAt(staff,false);
  assert.equal(Story.nearest(clear)?.id,staff,'open physical station shows the handoff action');
  assert.equal(Story.interact(clear).ok,true);
  assert.equal(clear.guide.released,true);
  assert.equal(clear.guide.active,false);
  const saved=Story.restore(Story.serialize(clear));
  assert.equal(saved.guide.released,true);
  assert.equal(saved.phase,'exit');

  const blocked=escortAt(staff,true);
  assert.notEqual(Story.nearest(blocked)?.id,staff,
    'the handoff should not appear when civilian and staff cannot see each other');
  const attempt=Story.interact(blocked);
  assert.notEqual(attempt.event,'guideRelease');
  assert.equal(blocked.guide.released,false);
  assert.equal(blocked.guide.active,true);
  assert.equal(blocked.guide.waiting,true);
  const replay=Story.restore(Story.serialize(blocked));
  assert.notEqual(Story.nearest(replay)?.id,staff,'60Hz checkpoint restores the same obstruction');
  Story.step(replay,1/60,{});
  assert.equal(replay.guide.released,false,'time cannot bypass a blocked handoff');
 });
}

test('CH01 short staffed handoff remains valid when the guide can physically see staff',()=>{
 const state=escortAt('guideRelease');
 state.world.obstacles.push({x:Story.POINTS.guideRelease.x+1,z:Story.POINTS.guideRelease.z+3,
   w:.4,d:.4,type:'story-container'});
 assert.equal(Story.nearest(state)?.id,'guideRelease');
 assert.equal(Story.interact(state).ok,true);
 assert.equal(state.guide.released,true);
});
