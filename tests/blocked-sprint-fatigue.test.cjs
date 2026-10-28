'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const Sim = require('../src/simulation.js');
const Story = require('../src/story-slice.js');

// A physical wall directly ahead: the player starts outside its collision radius.
function setup(kind) {
  const state = kind === 'br' ? Sim.newMatch(20261028, 1) : Story.createState();
  const world = kind === 'br' ? state : state.world;
  world.status = 'playing';
  world.obstacles.push({x:4,z:0,w:2,d:4});
  Object.assign(world.player, {x:2.14,z:0,yaw:Math.PI/2,stamina:60,stress:20});
  const step = input => kind === 'br'
    ? Sim.tick(state,1/60,input) : Story.step(state,1/60,input);
  return {state,world,step};
}

for (const kind of ['br','story']) {
  test(kind + ': 60Hz sprinting against solid cover does not drain stamina or raise stress', () => {
    const a = setup(kind), b = setup(kind);
    for (let i=0;i<60;i++) {
      a.step({forward:true,sprint:true});
      b.step({forward:true,sprint:true});
    }
    for (const {world} of [a,b]) {
      assert.equal(world.player.x,2.14,'solid wall prevents forward travel');
      assert.ok(Math.abs(world.player.z)<1e-9);
      assert.ok(world.player.stamina>60,'resting at a blocked wall recovers stamina');
      assert.ok(world.player.stress<20,'a blocked input cannot generate sprint stress');
    }
    assert.deepEqual(
      [a.world.player.x,a.world.player.z,a.world.player.stamina,a.world.player.stress],
      [b.world.player.x,b.world.player.z,b.world.player.stamina,b.world.player.stress],
      'the same fixed-step input remains deterministic'
    );
    const rested=a.world.player.stamina;
    a.world.obstacles.pop();
    for (let i=0;i<60;i++)a.step({forward:true,sprint:true});
    assert.ok(a.world.player.x>2.14,'unobstructed sprint moves the player');
    assert.ok(a.world.player.stamina<rested,'actual sprint travel spends stamina');
  });

  test(kind + ': partial collision still counts physically resolved sprint travel', () => {
    const {world,step}=setup(kind);
    world.player.yaw=0;
    step({forward:true,right:true,sprint:true});
    assert.equal(world.player.x,2.14,'the blocked lateral component stays blocked');
    assert.ok(world.player.z<0,'the unblocked component moves');
    assert.ok(world.player.stamina<60,'sliding along cover still expends effort');
    assert.ok(world.player.stress>20);
  });
}
