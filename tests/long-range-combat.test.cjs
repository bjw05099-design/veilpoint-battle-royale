'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Sim = require('../src/simulation.js');
const Story = require('../src/story-slice.js');

// Original fictional gameplay ranges, not real firearm specifications.
function corridor(weaponId, startX, endX, z) {
  const game = Sim.newMatch(20261031, 1, weaponId);
  game.status = 'playing';
  Object.assign(game.player, {x:startX, z, yaw:Math.PI / 2, pitch:0});
  Object.assign(game.bots[0], {x:endX, z, health:100, alive:true});
  assert.equal(Sim.lineBlocked(startX,z,endX,z,game.obstacles),false,
    'long-range test corridor must be unobstructed');
  return game;
}
test('precision reaches a clear 210m corridor but medium/compact classes do not', () => {
  const shots = ['precision','marksman','compact'].map(id => {
    const game = corridor(id, -105, 105, -20);
    const before = game.player.charges;
    const result = Sim.tag(game);
    assert.equal(result.ok,true);
    assert.equal(game.player.charges,before-1,'even misses spend finite ammunition');
    return result.hit;
  });
  assert.deepEqual(shots,[true,false,false]);
});
test('mid-range classes remain distinct and aim never magnetically expands with range', () => {
  assert.equal(Sim.tag(corridor('marksman',-70,70,0)).hit,true);
  assert.equal(Sim.tag(corridor('compact',-70,70,0)).hit,false);
  const offAxis = corridor('precision',-105,105,-20);
  offAxis.bots[0].z += 2;
  assert.equal(Sim.tag(offAxis).hit,false);
});
test('long-range ray stops at solid cover or finite weapon reach', () => {
  const blocked = Sim.newMatch(20261031,1,'precision');
  blocked.status='playing';
  Object.assign(blocked.player,{x:0,z:-70,yaw:0,pitch:0});
  Object.assign(blocked.bots[0],{x:0,z:-140,health:100,alive:true});
  assert.equal(Sim.lineBlocked(0,-70,0,-140,blocked.obstacles),true);
  const before=blocked.player.charges;
  assert.equal(Sim.tag(blocked).hit,false);
  assert.equal(blocked.bots[0].health,100);
  assert.equal(blocked.player.charges,before-1);
  assert.equal(Sim.tag(corridor('precision',-150,150,-20)).hit,false,
    '300m is outside the authored 260m limit');
});
test('CH01 inherits the same finite long-range hit and clears only real opponents', () => {
  const state=Story.createState('precision');
  state.world.player.x=0;state.world.player.z=-18;
  assert.equal(Story.interact(state).phase,'engagement');
  Object.assign(state.world.player,{x:-105,z:-20,yaw:Math.PI/2,pitch:0});
  Object.assign(state.world.bots[0],{x:105,z:-20,health:90,alive:true});
  for(const hostile of state.world.bots.slice(1)){hostile.health=0;hostile.alive=false;}
  const before=state.world.player.charges;
  const result=Story.fire(state);
  assert.equal(result.hit,true);
  assert.equal(state.world.player.charges,before-1);
  assert.equal(state.phase,'records');
  assert.equal(state.combat.cleared,true);
});
