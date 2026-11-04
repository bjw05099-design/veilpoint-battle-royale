'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Story=require('../src/story-slice.js');

function prepared() {
  const state=Story.createState();
  state.world.player.x=0;
  state.world.player.z=-18;
  assert.equal(Story.interact(state).ok,true);
  for(const bot of state.world.bots){bot.health=0;bot.alive=false;}
  state.combat.cleared=true;
  state.phase='exit';
  state.choice='verification';
  state.found=['recordA','recordB'];
  state.gateClearanceDuration=8;
  state.gateReadyAt=8;
  state.world.elapsed=0;
  return state;
}

test('CH01 moving gate respects the full swept footprint at the trailing edge',()=>{
  const state=prepared();
  const gate=state.world.obstacles.find(o=>o.routeId==='east-checkpoint');
  assert.equal(gate.x,27);
  state.world.player.x=33.9;
  state.world.player.z=-53;
  Story.step(state,.05,{});
  assert.equal(state.gateObstructed,true);
  assert.equal(gate.x,27,'obstruction must freeze physical gate geometry');
  assert.equal(state.gateReadyAt,8.05);
  state.world.player.x=42;
  Story.step(state,.05,{});
  assert.equal(state.gateObstructed,false);
  assert.ok(gate.x<27,'motor should resume once player clears its travel');
});

test('CH01 unobstructed gate travel replays identically from a checkpoint',()=>{
  const state=prepared();
  state.world.player.x=42;
  state.world.player.z=-53;
  for(let i=0;i<60;i++)Story.step(state,1/60,{});
  const restored=Story.restore(Story.serialize(state));
  for(let i=0;i<60;i++){
    Story.step(state,1/60,{});
    Story.step(restored,1/60,{});
  }
  assert.equal(Story.serialize(state),Story.serialize(restored));
});
