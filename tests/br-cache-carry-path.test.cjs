'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Sim=require('../src/simulation.js');

test('BR cache carry rejects a supply obstruction halfway along the physical path',()=>{
  const game=Sim.newMatch(17404,0);
  game.status='playing';
  game.player.x=0;game.player.z=0;game.player.yaw=0;
  // Keep all unrelated caches away from the local interaction.
  for(const item of game.loot){item.x=140;item.z=140;}
  const carried=game.loot[0],other=game.loot[1];
  carried.x=0;carried.z=-1.5;
  // More than 1.2m from either endpoint, but less than 1.2m
  // from the middle of the 1.1m hand-carried displacement.
  other.x=1.17;other.z=-2.05;
  const before={x:carried.x,z:carried.z,remaining:carried.remaining};
  const blocked=Sim.repositionCache(game);
  assert.deepEqual(blocked,{ok:false,reason:'path_blocked'});
  assert.deepEqual({x:carried.x,z:carried.z,remaining:carried.remaining},before);
  other.x=140;other.z=140;
  const moved=Sim.repositionCache(game);
  assert.equal(moved.ok,true);
  assert.equal(carried.z,-2.6);
  assert.equal(carried.remaining,before.remaining);
  const snapshot=Sim.snapshotMatch(game);
  const restored=Sim.restoreMatch(snapshot);
  assert.equal(restored.loot[0].z,carried.z);
  assert.equal(restored.loot[0].remaining,carried.remaining);
});
