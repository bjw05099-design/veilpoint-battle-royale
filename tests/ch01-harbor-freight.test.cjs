'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Story = require('../src/story-slice.js');
const Sim = require('../src/simulation.js');

test('CH01 outer harbor freight stacks are physical, distinct and cannot block the opening route', () => {
  const state = Story.createState();
  const stacks = state.world.obstacles.filter(o => o.type === 'story-container' && o.z < -80);
  assert.equal(stacks.length, 2);
  assert.deepEqual(stacks.map(o => [o.x,o.z,o.h]), [[-72,-84,5.2],[72,-91,2.6]]);
  for (const o of stacks) {
    assert.equal(Sim.blocked(o.x,o.z,.85,state.world.obstacles),true);
  }
  for (const [x,z] of [[0,12],[0,-18],[0,-41],[-9,-55],[0,-61],[27,-61]]) {
    assert.equal(Sim.blocked(x,z,.85,stacks),false, 'freight must not obstruct mission waypoint');
  }
});
