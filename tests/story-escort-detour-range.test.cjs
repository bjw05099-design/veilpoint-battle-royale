'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Story=require('../src/story-slice.js');
const Sim=require('../src/simulation.js');

function escort() {
  const s=Story.restore(JSON.stringify({
    version:1,phase:'exit',found:[],choice:'evacuation',
    player:{x:-9,z:-55,yaw:0,pitch:0,stamina:100},elapsed:12
  }));
  s.world.player.x=Story.POINTS.muster.x;
  s.world.player.z=Story.POINTS.muster.z;
  assert.equal(Story.interact(s).event,'muster');
  assert.equal(Story.interact(s).event,'guide');
  return s;
}

test('CH01 physical escort keeps detouring beyond the old 11m cutoff with matching HUD and checkpoint',()=>{
  const s=escort();
  s.world.player.x=1;s.world.player.z=-55;
  const wall={x:-6,z:-55,w:1.5,d:9.5,type:'story-container'};
  s.world.obstacles.push(wall);
  const initial={x:s.guide.x,z:s.guide.z};
  const range=Math.hypot(initial.x-s.world.player.x,initial.z-s.world.player.z);
  assert.ok(range>11&&range<14);
  assert.match(Story.situation(s).guideStatus,/우회 중/,
    'HUD must not claim escort lost when the local physical detour is valid');
  for(let tick=0;tick<180;tick++)Story.step(s,1/60,{});
  assert.ok(Math.hypot(s.guide.x-initial.x,s.guide.z-initial.z)>1,
    'guide should advance toward the physical corner instead of freezing');
  assert.equal(Sim.blocked(s.guide.x,s.guide.z,.55,s.world.obstacles),false);
  const saved=Story.serialize(s);
  const restored=Story.restore(saved);
  restored.world.obstacles.push({...wall});
  assert.equal(Story.serialize(restored),saved,
    'new walking allowance must not introduce a hidden checkpoint field');
  for(let tick=0;tick<120;tick++){
    Story.step(s,1/60,{});
    Story.step(restored,1/60,{});
  }
  assert.ok(Math.abs(s.guide.x-restored.guide.x)<1e-6);
  assert.ok(Math.abs(s.guide.z-restored.guide.z)<1e-6,
    'saved companion pose must continue deterministically at 60Hz');
});

test('CH01 does not follow an unobstructed player 11-14m away',()=>{
  const s=escort();
  s.world.player.x=1;s.world.player.z=-55;
  const pose={x:s.guide.x,z:s.guide.z};
  for(let tick=0;tick<240;tick++)Story.step(s,1/60,{});
  assert.deepEqual({x:s.guide.x,z:s.guide.z},pose);
  assert.equal(s.guide.waiting,true,'civilian has stopped at the last real position');
  assert.match(Story.situation(s).guideStatus,/현장 대기/);
});

test('CH01 never extends local obstacle detour into remote pursuit past 14m',()=>{
  const s=escort();
  s.world.player.x=5;s.world.player.z=-55;
  s.world.obstacles.push({x:-6,z:-55,w:1.5,d:9.5,type:'story-container'});
  const pose={x:s.guide.x,z:s.guide.z};
  for(let tick=0;tick<240;tick++)Story.step(s,1/60,{});
  assert.deepEqual({x:s.guide.x,z:s.guide.z},pose);
  assert.match(Story.situation(s).guideStatus,/거리 이탈/);
});
