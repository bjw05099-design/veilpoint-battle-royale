'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Sim=require('../src/simulation.js');
function scenario(stock){
 const game=Sim.newMatch(733,1,'carbine');
 game.status='playing';game.obstacles=[];
 game.player.x=125;game.player.z=125;
 const b=game.bots[0];
 Object.assign(b,{x:0,z:0,angle:Math.PI/2,moveTime:999,actionTime:999,
  lastSeenUntil:0,charges:stock,loaded:Math.min(stock,12)});
 game.zone.x=0;game.zone.z=0;game.zone.radius=160;
 game.loot=[{id:'local-stock',x:7,z:0,kind:'ammo',weaponId:'carbine',remaining:12,picked:false}];
 return {game,b};
}
test('a rival with a partially spent reserve approaches observed physical supply',()=>{
 const {game,b}=scenario(18);
 const initial=b.x;
 for(let i=0;i<80;i++)Sim.tick(game,1/60,{});
 assert.ok(b.x>initial+1.5,'low-stock rival should advance toward the reachable cache');
 assert.ok(b.x<7,'movement must be physical, not an instant supply transfer');
 assert.equal(game.loot[0].remaining,12,'distant stock is not remotely consumed');
});
test('well-stocked rival does not magically know the same cache location',()=>{
 const {game,b}=scenario(30);
 const before=b.x;
 for(let i=0;i<80;i++)Sim.tick(game,1/60,{});
 assert.ok(b.x<before+1.5,'ordinary patrol should not acquire the low-stock detour speed');
 assert.equal(game.loot[0].remaining,12);
});
test('blocked cache cannot become an AI supply target through a solid wall',()=>{
 const {game,b}=scenario(18);
 game.obstacles=[{x:3.5,z:0,w:.5,d:12}];
 for(let i=0;i<80;i++){
  Sim.tick(game,1/60,{});
  assert.equal(Sim.blocked(b.x,b.z,.85,game.obstacles),false);
 }
 assert.equal(game.loot[0].remaining,12);
});
test('supply behavior replays deterministically across the existing BR save format',()=>{
 const {game}=scenario(18);
 const other=Sim.restoreMatch(Sim.snapshotMatch(game));
 for(let i=0;i<100;i++){
  Sim.tick(game,1/60,{});Sim.tick(other,1/60,{});
  assert.equal(Sim.snapshotMatch(game),Sim.snapshotMatch(other));
 }
});
