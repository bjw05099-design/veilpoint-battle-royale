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
 assert.match(html,/MAGAZINE \/ RESERVE/);
});

test('opponents cannot track or chase the player through solid buildings',()=>{
 const a=S.newMatch(301,1),b=a.bots[0],p=a.player;
 a.status='playing';
 b.x=-85;b.z=-100;b.angle=0;b.moveTime=999;b.actionTime=0;
 p.x=-85;p.z=-52;p.health=100;
 assert.equal(S.lineBlocked(b.x,b.z,p.x,p.z,a.obstacles),true);
 S.tick(a,1/60,{});
 assert.equal(b.angle,0);
 assert.equal(p.health,100);
});
test('visible nearby players can still influence opponent orientation',()=>{
 const a=S.newMatch(301,1),b=a.bots[0],p=a.player;
 a.status='playing';
 b.x=0;b.z=-25;b.angle=Math.PI/2;b.moveTime=999;b.actionTime=999;
 p.x=0;p.z=0;
 assert.equal(S.lineBlocked(b.x,b.z,p.x,p.z,a.obstacles),false);
 S.tick(a,1/60,{});
 assert.ok(b.angle>Math.PI/2);
});
test('browser firing feedback never reveals hidden hit confirmation',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const app=fs.readFileSync(path.resolve(__dirname,'../src/app.js'),'utf8');
 const html=fs.readFileSync(path.resolve(__dirname,'../index.html'),'utf8');
 assert.doesNotMatch(app,/TARGET TAGGED|SCANNING \/ CLEAR|result\.hit\?710/);
 assert.match(app,/SHOT FIRED/);
 assert.match(html,/CLICK — FIRE/);
});

test('opponents use finite magazines and cannot attack after exhausting carried rounds',()=>{
 const g=S.newMatch(314,1),b=g.bots[0],p=g.player;g.status='playing';
 p.x=0;p.z=0;b.x=0;b.z=-20;b.moveTime=999;b.actionTime=0;b.skill=1;
 b.loaded=1;b.charges=1;
 S.tick(g,1/60,{});
 assert.equal(b.loaded,0);assert.equal(b.charges,0);
 assert.ok(p.health<100);
 assert.ok(g.effects.some(e=>e.type==='hostile'));
 const health=p.health;
 for(let i=0;i<240;i++)S.tick(g,1/60,{});
 assert.equal(p.health,health);
 assert.equal(b.loaded,0);assert.equal(b.charges,0);
 assert.equal(b.reloadRemaining,0);
});
test('opponent reload blocks shots for a fixed 60Hz interval without creating ammo',()=>{
 const g=S.newMatch(315,1),b=g.bots[0],p=g.player;g.status='playing';
 p.x=0;p.z=0;b.x=0;b.z=-20;b.moveTime=999;b.actionTime=0;b.skill=1;
 b.loaded=0;b.charges=2;
 S.tick(g,1/60,{});
 assert.equal(b.reloadRemaining,S.RELOAD_SECONDS);
 for(let i=0;i<100;i++)S.tick(g,1/60,{});
 assert.equal(b.loaded,0);assert.equal(p.health,100);
 for(let i=0;i<12;i++)S.tick(g,1/60,{});
 assert.equal(b.reloadRemaining,0);assert.equal(b.loaded,2);
 assert.equal(b.charges,2);assert.equal(p.health,100);
 S.tick(g,1/60,{});
 assert.equal(b.loaded,1);assert.equal(b.charges,1);
 assert.ok(p.health<100);
});
test('opponent finite-ammunition simulation is reproducible at fixed 60Hz',()=>{
 const make=()=>{const g=S.newMatch(316,1),b=g.bots[0];g.status='playing';
   g.player.x=0;g.player.z=0;b.x=0;b.z=-20;b.moveTime=999;b.actionTime=0;
   b.loaded=2;b.charges=4;return g;};
 const a=make(),b=make();
 for(let i=0;i<300;i++){S.tick(a,1/60,{});S.tick(b,1/60,{});}
 const snapshot=g=>({health:g.player.health,bot:{loaded:g.bots[0].loaded,charges:g.bots[0].charges,
   reloadRemaining:g.bots[0].reloadRemaining,actionTime:g.bots[0].actionTime,x:g.bots[0].x,z:g.bots[0].z},elapsed:g.elapsed});
 assert.deepEqual(snapshot(a),snapshot(b));
 assert.ok(a.bots[0].charges<=4);
});
