'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Sim=require('../src/simulation.js');
const forward=(x,z,a,d=2.25)=>({x:x+Math.sin(a)*d,z:z-Math.cos(a)*d});
test('real local collision makes a rival choose a collision-free side, not phase through cover',()=>{
 const actor={x:0,z:0},wall=[{x:0,z:-1.8,w:3.4,d:.6}];
 const east=Sim.localDetourHeading(actor,0,wall,.85,1);
 const west=Sim.localDetourHeading(actor,0,wall,.85,-1);
 assert.notEqual(east,0,'blocked forward route should not keep the old direct heading');
 assert.notEqual(west,0);
 assert.ok(east>0&&west<0,'stable identity breaks symmetric navigation ties');
 for(const heading of [east,west]){
  for(const t of [1/3,2/3,1]){
   const p=forward(actor.x,actor.z,heading,2.25*t);
   assert.equal(Sim.blocked(p.x,p.z,.85,wall),false,'intermediate path must be physically clear');
  }
 }
 const clear=Sim.localDetourHeading(actor,0,[],.85,1);
 assert.equal(clear,0,'unobstructed characters retain normal movement');
 assert.deepEqual(actor,{x:0,z:0},'navigation query never moves a character');
});
test('box-shaped dead end has a finite fallback and no search-target disclosure',()=>{
 const actor={x:0,z:0};
 const walls=[{x:0,z:-2,w:8,d:1},{x:-2,z:0,w:1,d:8},{x:2,z:0,w:1,d:8},
  {x:0,z:2,w:8,d:1}];
 const left=Sim.localDetourHeading(actor,0,walls,.85,-1);
 const right=Sim.localDetourHeading(actor,0,walls,.85,1);
 assert.ok(Number.isFinite(left)&&Number.isFinite(right));
 assert.ok(Math.abs(left)<=Math.PI*2&&Math.abs(right)<=Math.PI*2);
 assert.equal(Sim.localDetourHeading(actor,0,walls,.85,1),right);
});
test('BR actor actually navigates along a physical wall under standard 60Hz movement',()=>{
 const game=Sim.newMatch(75,1);
 game.status='playing';
 game.player.x=100;game.player.z=100;
 const b=game.bots[0];
 Object.assign(b,{x:0,z:0,angle:0,moveTime:999,actionTime:999,lastSeenUntil:0});
 const barriers=[{x:0,z:-2,w:3.4,d:.6}];
 game.obstacles=barriers;
 let moved=0;
 for(let i=0;i<96;i++){
  const x=b.x,z=b.z;
  Sim.tick(game,1/60,{});
  moved+=Math.hypot(b.x-x,b.z-z);
  assert.equal(Sim.blocked(b.x,b.z,.85,barriers),false,'no 60Hz collision penetration');
  assert.ok(game.status==='playing'||i===95,'scene must remain interactable');
 }
 assert.ok(moved>.25,'NPC must use walkable ground instead of freezing on cover');
 assert.ok(Math.hypot(b.x,b.z)>0,'no instant position reset');
 assert.ok(b.charges<=36&&b.loaded<=12,'navigation must not manufacture finite resources');
});
test('existing BR checkpoint replays a deterministic 60Hz NPC movement stream',()=>{
 const a=Sim.newMatch(20261107,4,'carbine',false,'west','dusk');
 a.status='playing';
 const b=Sim.restoreMatch(Sim.snapshotMatch(a));
 for(let i=0;i<80;i++){
  Sim.tick(a,1/60,{});Sim.tick(b,1/60,{});
  assert.deepEqual(a.bots.map(o=>[o.x,o.z,o.angle,o.moveTime,o.charges]),
    b.bots.map(o=>[o.x,o.z,o.angle,o.moveTime,o.charges]));
  if(a.status!=='playing'||b.status!=='playing')break;
  assert.equal(Sim.snapshotMatch(a),Sim.snapshotMatch(b));
 }
});
