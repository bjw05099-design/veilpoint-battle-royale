'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const story=require('../src/story-slice.js');

function reachEscort() {
  const s=story.createState();
  const go=id=>{s.world.player.x=story.POINTS[id].x;s.world.player.z=story.POINTS[id].z;};
  go('terminal');assert.equal(story.interact(s).ok,true);
  for(const bot of s.world.bots)for(let i=0;i<2;i++){
    s.world.player.yaw=Math.atan2(bot.x-s.world.player.x,-(bot.z-s.world.player.z));
    s.world.player.pitch=0;s.world.elapsed+=.21;
    assert.equal(story.fire(s).hit,true);
  }
  go('decision');assert.equal(story.interact(s).ok,true);
  assert.equal(story.choose(s,'evacuation').ok,true);
  go('muster');assert.equal(story.interact(s).ok,true);
  assert.equal(story.interact(s).event,'guide');
  s.guide.waiting=true;
  return s;
}

test('CH01 paused escort HUD only offers E resume when companion is visible and nearby',()=>{
  const s=reachEscort();
  // Behind the guide, the handoff desk is out of arm's reach: E resumes.
  s.world.player.x=s.guide.x-1;s.world.player.z=s.guide.z;
  assert.equal(story.nearest(s)?.id,'guideControl');
  assert.notEqual(story.situation(s).visibleEscortDistance,null);
  assert.match(story.situation(s).guideStatus,/E로 재개/);
  // On the other side, the staffed desk takes interaction priority over resume.
  s.world.player.x=s.guide.x+0.8;
  assert.equal(story.nearest(s)?.id,'guideRelease');
  assert.match(story.situation(s).guideStatus,/E로.*인계/);
  assert.doesNotMatch(story.situation(s).guideStatus,/E로 재개/);
  // Visible from several metres away does not mean the PC E key can reach.
  s.world.player.x=s.guide.x-3;
  assert.equal(story.nearest(s),null);
  assert.notEqual(story.situation(s).visibleEscortDistance,null);
  assert.match(story.situation(s).guideStatus,/다가가/);
  assert.doesNotMatch(story.situation(s).guideStatus,/E로 재개 가능/);
  s.world.player.x=story.POINTS.exitEvac.x;
  s.world.player.z=story.POINTS.exitEvac.z;
  assert.equal(story.situation(s).visibleEscortDistance,null);
  assert.doesNotMatch(story.situation(s).guideStatus,/E로 재개/);
  assert.match(story.situation(s).guideStatus,/돌아가세요/);
  const restored=story.restore(story.serialize(s));
  assert.equal(story.situation(restored).guideStatus,story.situation(s).guideStatus);
});

test('CH01 fixed-step waiting guide HUD and interaction target survive checkpoint recovery',()=>{
  const s=reachEscort();
  s.world.player.x=s.guide.x-3;s.world.player.z=s.guide.z;
  const checkpoint=story.serialize(s);
  const recovered=story.restore(checkpoint);
  assert.equal(story.serialize(recovered),checkpoint);
  assert.equal(story.situation(recovered).guideStatus,story.situation(s).guideStatus);
  story.step(recovered,1/60,{});
  assert.equal(recovered.guide.waiting,true);
  assert.match(story.situation(recovered).guideStatus,/다가가/);
  recovered.world.player.x=recovered.guide.x-1;
  assert.equal(story.nearest(recovered)?.id,'guideControl');
  assert.equal(story.interact(recovered).event,'guideControl');
  assert.equal(recovered.guide.waiting,false);
  const after=story.serialize(recovered);
  const reloaded=story.restore(after);
  assert.equal(reloaded.guide.waiting,false);
  assert.doesNotMatch(story.situation(reloaded).guideStatus,/현장 대기/);
});
