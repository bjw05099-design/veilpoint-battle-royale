'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Story=require('../src/story-slice.js');

test('CH01 invalid or paused frame cannot trigger a due hostile volley or mutate time',()=>{
  const state=Story.createState();
  state.world.player.x=Story.POINTS.terminal.x;
  state.world.player.z=Story.POINTS.terminal.z;
  assert.equal(Story.interact(state).ok,true);
  const b=state.world.bots[0];
  b.angle=0;
  state.combat.nextPulseAt=state.world.elapsed;
  const before=Story.serialize(state);
  for(const dt of [0,-1,NaN,Infinity,-Infinity]){
    Story.step(state,dt,{forward:true,sprint:true});
    assert.equal(Story.serialize(state),before);
  }
  Story.step(state,1/60,{});
  assert.ok(state.world.elapsed>0);
  assert.ok(state.combat.nextPulseAt>state.world.elapsed,
    'a valid 60Hz step schedules the next finite hostile opportunity');
});
