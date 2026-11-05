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
  s.world.player.x=s.guide.x+0.8;s.world.player.z=s.guide.z;
  assert.notEqual(story.situation(s).visibleEscortDistance,null);
  assert.match(story.situation(s).guideStatus,/E로 재개/);
  s.world.player.x=story.POINTS.exitEvac.x;
  s.world.player.z=story.POINTS.exitEvac.z;
  assert.equal(story.situation(s).visibleEscortDistance,null);
  assert.doesNotMatch(story.situation(s).guideStatus,/E로 재개/);
  assert.match(story.situation(s).guideStatus,/돌아가세요/);
  const restored=story.restore(story.serialize(s));
  assert.equal(story.situation(restored).guideStatus,story.situation(s).guideStatus);
});
