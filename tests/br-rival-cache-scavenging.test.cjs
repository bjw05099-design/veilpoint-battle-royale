'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Sim=require('../src/simulation.js');

function nearCache(seed){
 const g=Sim.newMatch(seed,1);
 g.status='playing';
 const b=g.bots[0];
 const cache=g.loot.find(c=>c.weaponId==='carbine'&&c.remaining>0&&
   !Sim.blocked(c.x+1,c.z,0.85,g.obstacles)&&
   Math.hypot(c.x+1,c.z)>12);
 assert.ok(cache,'seed supplies a physical reachable carbine cache');
 b.x=cache.x+1;b.z=cache.z;b.moveTime=2;b.actionTime=100;
 b.charges=12;b.loaded=12;b.lastSeenUntil=0;
 return {g,b,cache};
}

test('BR rival physically takes only finite shared stock and cannot duplicate it',()=>{
 const {g,b,cache}=nearCache(184101);
 const total=b.charges+cache.remaining;
 Sim.tick(g,1/60,{});
 assert.ok(b.charges>12,'rival recovered stock at real reach');
 assert.equal(b.charges+cache.remaining,total,'shared finite world stock conserved');
 assert.equal(cache.picked,cache.remaining===0);
 const after=b.charges;
 Sim.tick(g,1/60,{});
 assert.ok(b.charges<=36);
 assert.ok(b.charges>=after,'no remote stock creation or negative ammo');
});

test('BR rival cannot collect a cache from outside physical reach',()=>{
 const {g,b,cache}=nearCache(184102);
 b.x=cache.x+10;b.z=cache.z;
 const stock=cache.remaining;
 Sim.tick(g,1/60,{});
 assert.equal(cache.remaining,stock);
 assert.equal(b.charges,12);
});

test('BR rival cache depletion survives checkpoint and 60Hz continuation',()=>{
 const {g,b,cache}=nearCache(184103);
 Sim.tick(g,1/60,{});
 const restored=Sim.restoreMatch(Sim.snapshotMatch(g));
 assert.equal(restored.loot[cache.id].remaining,cache.remaining);
 assert.equal(restored.bots[0].charges,b.charges);
 for(let i=0;i<120;i++){
   Sim.tick(g,1/60,{});
   Sim.tick(restored,1/60,{});
 }
 assert.equal(restored.bots[0].charges,g.bots[0].charges);
 assert.equal(restored.loot[cache.id].remaining,g.loot[cache.id].remaining);
 assert.equal(restored.bots[0].x,g.bots[0].x);
});
