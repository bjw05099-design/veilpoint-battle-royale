'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const story=require('../src/story-slice.js');
const Sim=require('../src/simulation.js');

test('legacy CH01 gate checkpoint is recovered without crossing into solid scenery',()=>{
  const state=story.createState();
  state.world.player.x=27;
  state.world.player.z=-53;
  const raw=story.serialize(state);
  const a=story.restore(raw);
  const b=story.restore(raw);
  assert.equal(a.phase,'terminal');
  assert.equal(a.world.status,'playing');
  assert.equal(Sim.blocked(a.world.player.x,a.world.player.z,.85,a.world.obstacles),false);
  assert.deepEqual([a.world.player.x,a.world.player.z],[b.world.player.x,b.world.player.z]);
  assert.notDeepEqual([a.world.player.x,a.world.player.z],[27,-53]);
});

test('CH01 gate recovery does not move a valid saved position',()=>{
  const state=story.createState();
  state.world.player.x=27;
  state.world.player.z=-49;
  const restored=story.restore(story.serialize(state));
  assert.deepEqual([restored.world.player.x,restored.world.player.z],[27,-49]);
});
