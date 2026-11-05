'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Story=require('../src/story-slice.js');

function startLongWallEscort(){
  const state=Story.restore(JSON.stringify({
    version:1,phase:'exit',found:[],choice:'evacuation',
    player:{x:-9,z:-55,yaw:0,pitch:0,stamina:100},elapsed:12
  }));
  state.world.player.x=Story.POINTS.muster.x;
  state.world.player.z=Story.POINTS.muster.z;
  assert.equal(Story.interact(state).event,'muster');
  assert.equal(Story.interact(state).event,'guide');
  state.world.player.x=-5;
  state.world.player.z=-55;
  const wall={x:-7.75,z:-55,w:1.5,d:16,type:'story-container'};
  state.world.obstacles.push(wall);
  return {state,wall};
}

test('CH01 long solid wall no longer deadlocks nearby civilian escort',()=>{
  const {state:s,wall}=startLongWallEscort();
  const start={x:s.guide.x,z:s.guide.z};
  assert.match(Story.situation(s).guideStatus,/우회 중/);
  for(let tick=0;tick<240;tick++)Story.step(s,1/60,{});
  assert.ok(Math.hypot(s.guide.x-start.x,s.guide.z-start.z)>4,
    'guide must physically move toward a walkable corner rather than freeze at the wall');
  const save=Story.serialize(s);
  const restored=Story.restore(save);
  restored.world.obstacles.push({...wall});
  assert.equal(Story.serialize(restored),save,
    'checkpoint contract remains unchanged after a long physical detour');
  for(let tick=0;tick<60;tick++){
    Story.step(s,1/60,{});
    Story.step(restored,1/60,{});
  }
  assert.ok(Math.abs(s.guide.x-restored.guide.x)<1e-6);
  assert.ok(Math.abs(s.guide.z-restored.guide.z)<1e-6,
    '60Hz route resumes deterministically without a hidden path state');
  for(let tick=0;tick<1100;tick++)Story.step(restored,1/60,{});
  assert.ok(Math.hypot(restored.guide.x-restored.world.player.x,
    restored.guide.z-restored.world.player.z)<2.4,
    'guide ultimately reunites with nearby player via physical movement');
});

test('CH01 long-detour allowance does not enable remote pursuit on clear ground',()=>{
  const {state:s}=startLongWallEscort();
  s.world.obstacles=s.world.obstacles.filter(o=>o.type!=='story-container');
  s.world.player.x=2.5;
  s.world.player.z=-55;
  const before={x:s.guide.x,z:s.guide.z};
  for(let tick=0;tick<120;tick++)Story.step(s,1/60,{});
  assert.deepEqual({x:s.guide.x,z:s.guide.z},before);
  assert.match(Story.situation(s).guideStatus,/거리 이탈/);
});
