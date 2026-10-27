const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../src/simulation.js');
test('seeded maps and opponents reproduce',()=>{
 const a=S.newMatch(301,18),b=S.newMatch(301,18);
 assert.deepEqual(a.bots.map(({x,z})=>({x,z})),b.bots.map(({x,z})=>({x,z})));
});
test('movement is collision-clamped',()=>{
 const a=S.newMatch(2,0), p=a.player; a.status='playing';p.x=174;p.z=0;p.yaw=Math.PI/2;
 S.tick(a,0.05,{forward:true,sprint:true});assert.ok(p.x<=174.2);
});
test('phase radius always decreases',()=>{
 let prev=Infinity;for(let t=0;t<450;t+=3){const r=S.phaseAt(t).radius;assert.ok(r<=prev);prev=r;}
});
test('damage absorbs shield first',()=>{
 const a=S.newMatch(2,0);S.receiveDamage(a,50);assert.equal(a.player.health,100);assert.equal(a.player.shield,30);
 S.receiveDamage(a,50);assert.equal(a.player.shield,0);assert.equal(a.player.health,80);
});
test('tag consumes one charge and rejects rapid repeats',()=>{
 const a=S.newMatch(2,0);a.status='playing';const count=a.player.charges;
 assert.equal(S.tag(a).ok,true);assert.equal(a.player.charges,count-1);
 assert.equal(S.tag(a).reason,'cooldown');
});
test('pickups apply capped health',()=>{
 const a=S.newMatch(2,0);a.status='playing';a.player.health=85;
 const item=a.loot.find(x=>x.kind==='med');item.x=0;item.z=0;
 assert.equal(S.pickup(a),'med');assert.equal(a.player.health,100);assert.equal(S.pickup(a),null);
});
test('victory when all rivals eliminated',()=>{
 const a=S.newMatch(2,0);a.status='playing';S.tick(a,0.03,{});assert.equal(a.status,'won');
});
test('world obstacles block crossing',()=>{
 const a=S.newMatch(2,0);const b=a.obstacles[0];assert.equal(S.blocked(b.x,b.z,1,a.obstacles),true);
});
