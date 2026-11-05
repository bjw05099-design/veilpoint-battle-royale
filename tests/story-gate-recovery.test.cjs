'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const story=require('../src/story-slice.js');
const Sim=require('../src/simulation.js');

test('legacy checkpoint inside closed gate resumes outside every solid obstacle',()=>{
  const state=story.createState();
  state.world.player.x=27;
  state.world.player.z=-53;
  const saved=story.serialize(state);
  const a=story.restore(saved);
  const b=story.restore(saved);
  assert.deepEqual([a.world.player.x,a.world.player.z],[b.world.player.x,b.world.player.z]);
  assert.equal(Sim.blocked(a.world.player.x,a.world.player.z,.85,a.world.obstacles),false);
  assert.match(a.message,/복구/);
  assert.equal(a.phase,'terminal');
  assert.equal(a.world.status,'playing');
});

test('nonoverlapping checkpoint retains its exact coordinates',()=>{
  const state=story.createState();
  const restored=story.restore(story.serialize(state));
  assert.equal(restored.world.player.x,state.world.player.x);
  assert.equal(restored.world.player.z,state.world.player.z);
});
