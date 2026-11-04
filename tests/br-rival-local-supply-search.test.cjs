'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Sim=require('../src/simulation.js');

test('BR low-stock rival seeks only a locally visible physical cache at fixed 60Hz',()=>{
 const g=Sim.newMatch(198001,1);g.status='playing';
 const b=g.bots[0];g.loot.forEach(c=>{c.remaining=0;c.picked=true;});
 // Keep one authored finite cache, clear of world obstacles and outside
 // the player's immediate view/engagement radius.
 const cache=g.loot.find(c=>c.weaponId==='carbine'&&
   Math.hypot(c.x,c.z)>35&&Math.hypot(c.x+5,c.z)<125&&!Sim.blocked(c.x+5,c.z,.85,g.obstacles)&&
   !Sim.lineBlocked(c.x+5,c.z,c.x,c.z,g.obstacles));
 assert.ok(cache);
 cache.remaining=12;cache.picked=false;
 b.x=cache.x+5;b.z=cache.z;b.angle=-Math.PI/2;b.moveTime=2;b.actionTime=2;
 b.charges=0;b.loaded=0;b.lastSeenUntil=0;
 const before=Math.hypot(b.x-cache.x,b.z-cache.z);
 let nearest=before;
 for(let i=0;i<120;i++){
   Sim.tick(g,1/60,{});
   nearest=Math.min(nearest,Math.hypot(b.x-cache.x,b.z-cache.z));
 }
 assert.ok(nearest<before-1,'low-stock AI closes distance to nearby observed cache');
 assert.ok(b.charges>0,'AI must physically arrive before replenishing');
 assert.equal(b.charges+cache.remaining,12,'local search conserves finite world rounds');
});

test('BR rivals do not seek a hidden or remote cache',()=>{
 const g=Sim.newMatch(198002,1);g.status='playing';
 const b=g.bots[0];b.charges=0;b.loaded=0;
 g.loot.forEach(c=>{c.remaining=0;c.picked=true;});
 const cache=g.loot.find(c=>c.weaponId==='carbine');
 cache.remaining=12;cache.picked=false;cache.x=145;cache.z=145;
 b.x=0;b.z=-50;b.angle=0;b.moveTime=2;b.actionTime=2;b.lastSeenUntil=0;
 for(let i=0;i<30;i++)Sim.tick(g,1/60,{});
 assert.equal(cache.remaining,12);
 assert.equal(b.charges,0);
});
