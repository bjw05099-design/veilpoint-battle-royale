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
 const m=Story.POINTS[staff],side=staff==='guideRelease'?-1:1;
 const guideOffset=staff==='guideRelease'?.8:1.2;
 const playerOffset=guideOffset/2;
 state.guide={active:true,arrived:false,released:false,waiting:true,
   x:m.x+side*guideOffset,z:m.z};
 state.world.player.x=m.x+side*playerOffset;state.world.player.z=m.z+1.2;
 if(barrier)state.world.obstacles.push({x:m.x+side*playerOffset,z:m.z,
   w:.22,d:.3,type:'story-container'});
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
  assert.equal(attempt.event,'guideControl',
    'the same PC E key may safely resume a nearby guide, but cannot hand them off through cover');
  assert.equal(blocked.guide.waiting,false);
  const replay=Story.restore(Story.serialize(blocked));
  // Checkpoints store the companion pose. Solid scenery comes from the
  // authored world; reapply this synthetic test-only wall after restore.
  replay.world.obstacles.push(blocked.world.obstacles[blocked.world.obstacles.length-1]);
  assert.notEqual(Story.nearest(replay)?.id,staff,'restored pose still respects physical cover');
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


for(const staff of ['guideRelease','guideTransfer']){
 test('CH01 '+staff+' is preferred over nearby guide pause when both are physically reachable',()=>{
  const state=escortAt(staff);
  const desk=Story.POINTS[staff];
  if(staff==='guideRelease'){
   // Player stays outside the solid standing guide, and close enough to staff.
   state.guide.x=desk.x-1;state.guide.z=desk.z-.5;
   state.world.player.x=desk.x;state.world.player.z=desk.z-1.7;
  }else{
   state.guide.x=desk.x+1.8;state.guide.z=desk.z-.5;
   state.world.player.x=desk.x+1.4;state.world.player.z=desk.z+.9;
  }
  assert.ok(Math.hypot(state.world.player.x-state.guide.x,
    state.world.player.z-state.guide.z)>1.4,'standing bodies do not overlap');
  assert.ok(Math.hypot(state.world.player.x-state.guide.x,
    state.world.player.z-state.guide.z)<
    Math.hypot(state.world.player.x-desk.x,state.world.player.z-desk.z),
    'the guide is actually nearer than the staffed interaction');
  assert.equal(Story.nearest(state)?.id,staff,'HUD advertises physical handoff, not pause');
  const restored=Story.restore(Story.serialize(state));
  assert.equal(Story.nearest(restored)?.id,staff,
    'the same actionable staff marker survives a v2 checkpoint round-trip');
  const before=restored.world.elapsed;
  Story.step(restored,1/60,{});
  assert.ok(restored.world.elapsed>before,'fixed world tick advances');
  assert.equal(Story.nearest(restored)?.id,staff,
    'waiting guide remains eligible during 60Hz simulation');
  assert.equal(Story.interact(restored).ok,true,'PC E fulfills the handoff');
  assert.equal(restored.guide.released,true);
  assert.equal(restored.guide.active,false);
  const after=Story.restore(Story.serialize(restored));
  assert.equal(after.guide.released,true);
  assert.equal(after.guide.waiting,false);
  assert.equal(after.phase,'exit','handoff does not magically complete evacuation');
 });
}
test('CH01 guide pause remains usable when no reachable staffed handoff exists',()=>{
 const state=escortAt('guideTransfer');
 state.guide.x=Story.POINTS.guideTransfer.x+2.7;
 state.guide.z=Story.POINTS.guideTransfer.z;
 state.world.player.x=state.guide.x+1.55;
 state.world.player.z=state.guide.z;
 assert.equal(Story.nearest(state)?.id,'guideControl');
 assert.equal(Story.interact(state).ok,true);
 assert.equal(state.guide.released,false);
 assert.equal(state.guide.waiting,false);
});
