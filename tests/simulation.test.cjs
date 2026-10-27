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
test('battle royale damage directly affects health even if legacy shield is injected',()=>{
 const a=S.newMatch(2,0);
 assert.equal(a.player.shield,0);
 a.player.shield=90;
 S.receiveDamage(a,50);
 assert.equal(a.player.shield,0);
 assert.equal(a.player.health,50);
 S.receiveDamage(a,50);
 assert.equal(a.player.health,0);
 assert.equal(a.player.alive,false);
 assert.equal(a.status,'lost');
});
test('tag consumes one charge and rejects rapid repeats',()=>{
 const a=S.newMatch(2,0);a.status='playing';const count=a.player.charges;
 assert.equal(S.tag(a).ok,true);assert.equal(a.player.charges,count-1);
 assert.equal(S.tag(a).reason,'cooldown');
});
test('all battle royale pickups are finite ammunition and cannot instantly restore health or shield',()=>{
 const a=S.newMatch(2,0);a.status='playing';a.player.health=35;a.player.charges=25;
 assert.equal(a.loot.length,40);
 assert.ok(a.loot.every(x=>x.kind==='ammo'||x.kind==='magazine'));
 a.loot.forEach(item=>{item.x=130;item.z=130;});
 const ammo=a.loot.find(x=>x.kind==='ammo');ammo.x=0;ammo.z=0;
 assert.equal(S.pickup(a),'ammo');assert.equal(a.player.charges,37);
 assert.equal(a.player.health,35);assert.equal(a.player.shield,0);
 assert.equal(S.pickup(a),null);
 const magazine=a.loot.find(x=>x.kind==='magazine');magazine.x=0;magazine.z=0;
 assert.equal(S.pickup(a),'magazine');assert.equal(a.player.charges,60);
 assert.equal(a.player.health,35);assert.equal(a.player.shield,0);
 const next=a.loot.find(x=>!x.picked);next.x=0;next.z=0;
 assert.equal(S.pickup(a),null);
 assert.equal(next.picked,false);
});
test('victory when all rivals eliminated',()=>{
 const a=S.newMatch(2,0);a.status='playing';S.tick(a,0.03,{});assert.equal(a.status,'won');
});
test('world obstacles block crossing',()=>{
 const a=S.newMatch(2,0);const b=a.obstacles[0];assert.equal(S.blocked(b.x,b.z,1,a.obstacles),true);
});

test('offline BR map keeps opponents undisclosed by the minimap UI',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const app=fs.readFileSync(path.resolve(__dirname,'../src/app.js'),'utf8');
 const html=fs.readFileSync(path.resolve(__dirname,'../index.html'),'utf8');
 assert.doesNotMatch(app,/for\(const bot of simulation\.bots\)/);
 assert.doesNotMatch(html,/id="shieldNum"|id="shieldBar"/);
 assert.match(html,/AVAILABLE AMMUNITION/);
});
