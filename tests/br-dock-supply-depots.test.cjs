'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Sim=require('../src/simulation.js');

test('two authored east-dock shelves host actual finite BR cache items on an empty seed',()=>{
 const game=Sim.newMatch(20261107,0,'carbine');
 assert.equal(game.loot.length,40,'world retains the historical 40-cache supply budget');
 assert.deepEqual(Sim.DOCK_DEPOTS,[{x:108,z:-121},{x:144,z:-121}]);
 for(let i=0;i<2;i++){
  assert.equal(game.loot[i].x,Sim.DOCK_DEPOTS[i].x);
  assert.equal(game.loot[i].z,Sim.DOCK_DEPOTS[i].z);
  assert.equal(game.loot[i].picked,false);
  assert.equal(Sim.blocked(game.loot[i].x,game.loot[i].z,.85,game.obstacles),false);
  assert.equal(Sim.blocked(game.loot[i].x,game.loot[i].z,2.4,game.obstacles),false);
 }
 assert.deepEqual(game.loot.map(x=>x.id),Array.from({length:40},(_,i)=>i));
});

test('BR dock physical shelf pickup transfers stock and survives signed checkpoint roundtrip',()=>{
 const game=Sim.newMatch(20261107,0,'carbine');
 game.status='playing';
 game.player.x=108;game.player.z=-119.65;
 const shelf=game.loot[0],initial=shelf.remaining,carried=game.player.charges;
 assert.equal(Sim.canReachPickup(game,shelf),true);
 assert.equal(Sim.pickup(game),'ammo');
 assert.equal(game.player.charges-carried,Math.min(initial,game.player.maxCharges-carried));
 assert.equal(shelf.remaining,0);
 assert.equal(shelf.picked,true,'physical stock cannot replenish itself');
 assert.equal(Sim.pickup(game),null,'a depleted cache cannot refill the same player');
 const saved=Sim.snapshotMatch(game);
 const restored=Sim.restoreMatch(saved);
 assert.equal(restored.loot[0].remaining,0);
 assert.equal(restored.loot[0].picked,true);
 assert.equal(restored.player.charges,game.player.charges);
 assert.equal(restored.loot.length,40);
});

test('BR fixed dock sites never overlap seeded living bots, walls or other caches',()=>{
 let authoredCount=0;
 for(const seed of [1,3,5,11,42,101,2026,20261107,9876543]){
  const game=Sim.newMatch(seed,18);
  const repeat=Sim.newMatch(seed,18);
  assert.deepEqual(game.loot.map(x=>[x.id,x.x,x.z,x.remaining]),
    repeat.loot.map(x=>[x.id,x.x,x.z,x.remaining]),'seeded world remains reproducible');
  assert.equal(game.loot.length,40);
  for(let i=0;i<2;i++){
   const item=game.loot[i],shelf=Sim.DOCK_DEPOTS[i];
   assert.equal(Sim.blocked(item.x,item.z,.85,game.obstacles),false);
   if(item.x===shelf.x&&item.z===shelf.z){
    authoredCount++;
    assert.ok(game.bots.every(bot=>Math.hypot(bot.x-item.x,bot.z-item.z)>4.1));
   }
   assert.ok(game.loot.every(other=>other===item||
      Math.hypot(other.x-item.x,other.z-item.z)>=1.2));
  }
 }
 assert.ok(authoredCount>=10,'physical east-dock depots appear in ordinary seeded matches');
});
