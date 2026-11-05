'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const story=require('../src/story-slice.js');
const Sim=require('../src/simulation.js');

test('CH01 legacy harbor save recovers player from a newly solid warehouse',()=>{
  const state=story.createState();
  state.world.player.x=-44;
  state.world.player.z=-73;
  const restored=story.restore(story.serialize(state));
  assert.equal(restored.phase,'terminal');
  assert.equal(Sim.blocked(restored.world.player.x,restored.world.player.z,.85,restored.world.obstacles),false);
  assert.notDeepEqual([restored.world.player.x,restored.world.player.z],[-44,-73]);
  assert.equal(restored.world.status,'playing');
});

test('CH01 valid checkpoint position is unchanged after recovery',()=>{
  const state=story.createState();
  state.world.player.x=0;state.world.player.z=12;
  const restored=story.restore(story.serialize(state));
  assert.deepEqual([restored.world.player.x,restored.world.player.z],[0,12]);
  assert.equal(restored.phase,state.phase);
});

test('CH01 harbor collision recovery is deterministic on repeated restore',()=>{
  const state=story.createState();
  state.world.player.x=42;state.world.player.z=-38;
  const raw=story.serialize(state);
  const a=story.restore(raw),b=story.restore(raw);
  assert.deepEqual([a.world.player.x,a.world.player.z],[b.world.player.x,b.world.player.z]);
  assert.equal(Sim.blocked(a.world.player.x,a.world.player.z,.85,a.world.obstacles),false);
});

// Older saves can start near a corner shared by newly authored harbor solids.
// The fallback must not leave the player in a solid or alter mission state.
test('CH01 legacy harbor recovery remains safe near a warehouse corner',()=>{
  const state=story.createState();
  state.world.player.x=-53;state.world.player.z=-79;
  const raw=story.serialize(state);
  const a=story.restore(raw),b=story.restore(raw);
  assert.equal(Sim.blocked(a.world.player.x,a.world.player.z,.85,a.world.obstacles),false);
  assert.deepEqual([a.world.player.x,a.world.player.z],[b.world.player.x,b.world.player.z]);
  assert.equal(a.phase,'terminal');
  assert.equal(a.world.status,'playing');
});
