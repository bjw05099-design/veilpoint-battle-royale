'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Sim=require('../src/simulation.js');
function blockedCache(){
 const s=Sim.newMatch(4401,1);
 s.status='playing';s.obstacles=[];
 s.player.x=0;s.player.z=0;
 s.bots[0].x=.4;s.bots[0].z=-1.7;s.bots[0].alive=true;
 s.loot=[{id:0,x:0,z:-1.79,kind:'ammo',weaponId:'carbine',remaining:6,picked:false}];
 return s;
}
test('BR living actor blocks physical pickup; moving actor away permits finite transfer',()=>{
 const s=blockedCache(),initial=s.player.charges;
 assert.equal(Sim.canReachPickup(s,s.loot[0]),false);
 assert.equal(Sim.pickup(s),null);
 assert.equal(s.player.charges,initial);
 s.bots[0].x=10;s.bots[0].z=10;
 assert.equal(Sim.canReachPickup(s,s.loot[0]),true);
 assert.equal(Sim.pickup(s),'ammo');
 assert.equal(s.player.charges,initial+6);
 assert.equal(s.loot[0].remaining,0);
});
test('BR living actor blocks cache deposit, preserving reserves until line of access clears',()=>{
 const s=blockedCache();
 s.player.charges=30;s.player.loaded=12;
 const initial=s.player.charges;
 assert.equal(Sim.depositReserve(s).ok,false);
 assert.equal(s.player.charges,initial);
 s.bots[0].x=10;s.bots[0].z=10;
 const result=Sim.depositReserve(s);
 assert.equal(result.ok,true);
 assert.equal(result.moved,6);
 assert.equal(s.player.charges,initial-6);
 assert.equal(s.loot[0].remaining,12);
 const raw=JSON.stringify(Sim.snapshotMatch(s));
 assert.equal(JSON.stringify(Sim.snapshotMatch(Sim.restoreMatch(raw))),raw);
});
