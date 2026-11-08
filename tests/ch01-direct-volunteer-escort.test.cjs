'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Story=require('../src/story-slice.js');
const go=(state,point)=>{state.world.player.x=point.x;state.world.player.z=point.z;};
function route(){
  const s=Story.createState();
  go(s,Story.POINTS.terminal);
  assert.equal(Story.interact(s).phase,'engagement');
  // Establish the post-encounter fixture; this is not a new gameplay shortcut.
  for(const b of s.world.bots){b.health=0;b.alive=false;}
  s.combat.cleared=true;s.phase='records';
  go(s,Story.POINTS.decision);
  assert.equal(Story.interact(s).phase,'decision');
  assert.equal(Story.choose(s,'evacuation').ok,true);
  return s;
}
test('CH01 player can directly recruit a physically present civilian without two routine desk confirmations',()=>{
  const s=route();
  assert.equal(s.musterConfirmed,false);
  assert.equal(s.guide.active,false);
  go(s,Story.POINTS.volunteer);
  assert.equal(Story.nearest(s)?.id,'volunteer');
  assert.equal(Story.interact(s).event,'volunteer');
  assert.equal(s.musterConfirmed,true);
  assert.equal(s.guide.active,true);
  assert.equal(s.guide.waiting,false);
  assert.equal(s.guide.x,Story.POINTS.volunteer.x);
  assert.equal(s.guide.z,Story.POINTS.volunteer.z);
  assert.equal(Story.markers(s).some(p=>p.id==='volunteer'),false);
  assert.equal(Story.missionTasks(s).find(t=>t.id==='guide').status,'following');
  assert.equal(s.dispatchReviewed,false);
  assert.equal(s.deploymentReviewed,false);
  assert.match(Story.situation(s).mandate,/출국 전 브리핑/);
  assert.match(Story.situation(s).mandate,/예기치 못한 내전/);
  assert.doesNotMatch(Story.situation(s).mandate,/최초 파견 목적.*대피/);
  const restored=Story.restore(Story.serialize(s));
  assert.equal(restored.musterConfirmed,true);
  assert.equal(restored.guide.active,true);
  assert.equal(restored.dispatchReviewed,false);
  assert.equal(restored.deploymentReviewed,false);
});
test('CH01 volunteer is a nearby optional player action, not a remote objective or mandatory task',()=>{
  const s=route();
  go(s,Story.POINTS.exitEvac);
  assert.equal(Story.markers(s).some(p=>p.id==='volunteer'),false);
  assert.equal(Story.interact(s).phase,'complete','default escape never requires an optional escort');
  const normal=route();
  go(normal,Story.POINTS.muster);
  assert.equal(Story.nearest(normal)?.id,'muster','the original staffed muster interaction remains playable');
  assert.equal(Story.interact(normal).event,'muster');
  assert.equal(normal.guide.active,false,'old optional two-stage interaction remains compatible');
  assert.equal(Story.interact(normal).event,'guide');
  assert.equal(normal.guide.active,true);
});
