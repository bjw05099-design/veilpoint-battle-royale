'use strict';
// Deterministic physical spawn constraints for the offline 60Hz BR prototype.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const Sim = require('../src/simulation.js');

const distance = (a,b) => Math.hypot(a.x-b.x,a.z-b.z);
test('seeded full BR rosters never start with overlapping actors or ground caches', () => {
  for(let seed=1;seed<=96;seed++){
    const game=Sim.newMatch(seed,20);
    const actors=[game.player,...game.bots];
    assert.equal(game.bots.length,20);
    assert.equal(game.loot.length,40);
    for(let i=0;i<actors.length;i++){
      assert.equal(Sim.blocked(actors[i].x,actors[i].z,.85,game.obstacles),false);
      for(let j=0;j<i;j++)
        assert.ok(distance(actors[i],actors[j])>=1.9-1e-9,
          'actor spawn overlap at seed '+seed+' pair '+i+','+j);
    }
    for(let i=0;i<game.loot.length;i++){
      const cache=game.loot[i];
      assert.equal(Sim.blocked(cache.x,cache.z,.85,game.obstacles),false);
      for(const actor of actors)
        assert.ok(distance(cache,actor)>=1.2-1e-9,'cache intersects actor at seed '+seed);
      for(let j=0;j<i;j++)
        assert.ok(distance(cache,game.loot[j])>=1.2-1e-9,
          'ground caches overlap at seed '+seed+' pair '+i+','+j);
    }
  }
});

test('collision-free seeded spawn remains reproducible and checkpoint-restorable', () => {
  const a=Sim.newMatch(20261031,20), b=Sim.newMatch(20261031,20);
  assert.deepEqual(a.bots.map(p=>[p.x,p.z]),b.bots.map(p=>[p.x,p.z]));
  assert.deepEqual(a.loot.map(p=>[p.x,p.z]),b.loot.map(p=>[p.x,p.z]));
  a.status='playing';
  const restored=Sim.restoreMatch(Sim.snapshotMatch(a));
  assert.deepEqual(restored.bots.map(p=>[p.x,p.z]),a.bots.map(p=>[p.x,p.z]));
  assert.deepEqual(restored.loot.map(p=>[p.x,p.z]),a.loot.map(p=>[p.x,p.z]));
});
