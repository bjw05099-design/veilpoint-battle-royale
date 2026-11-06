'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const story=require('../src/story-slice.js');
const Sim=require('../src/simulation.js');

test('CH01 escort overlap restore keeps the guide stationary and the player collision-free',()=>{
  const s=story.createState();
  const go=id=>{s.world.player.x=story.POINTS[id].x;s.world.player.z=story.POINTS[id].z;};
  go('terminal');assert.equal(story.interact(s).ok,true);
  for(const bot of s.world.bots){
    for(let i=0;i<2;i++){
      s.world.player.yaw=Math.atan2(bot.x-s.world.player.x,-(bot.z-s.world.player.z));
      s.world.player.pitch=0;s.world.elapsed+=.21;
      assert.equal(story.fire(s).hit,true);
    }
  }
  go('decision');assert.equal(story.interact(s).ok,true);
  assert.equal(story.choose(s,'evacuation').ok,true);
  go('muster');assert.equal(story.interact(s).ok,true);
  // A historic checkpoint may have the captain on top of the civilian.
  s.world.player.x=s.guide.x;s.world.player.z=s.guide.z;
  const guideBefore={x:s.guide.x,z:s.guide.z};
  const recovered=story.restore(story.serialize(s));
  assert.deepEqual({x:recovered.guide.x,z:recovered.guide.z},guideBefore);
  assert.equal(Sim.blocked(recovered.world.player.x,recovered.world.player.z,.85,
    recovered.world.obstacles.concat([{...guideBefore,w:1.1,d:1.1}])),false);
  assert.equal(recovered.choice,'evacuation');
  assert.equal(recovered.musterConfirmed,true);
  const stable=story.restore(story.serialize(recovered));
  assert.equal(stable.world.player.x,recovered.world.player.x);
  assert.equal(stable.world.player.z,recovered.world.player.z);
});
