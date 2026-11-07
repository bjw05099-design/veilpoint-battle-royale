'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const Sim=require('../src/simulation.js');

test('BR west quay has two actual blocked breakwaters with a free traversable 18m lane',()=>{
 const s=Sim.newMatch(20261107,0);
 const quay=s.obstacles.filter(x=>x.type==='dock-breakwater');
 const bollards=s.obstacles.filter(x=>x.type==='dock-bollard');
 assert.equal(quay.length,2);
 assert.equal(bollards.length,1);
 assert.deepEqual(quay.map(o=>[o.x,o.z,o.w,o.d]),[
  [-135,-126,22,2],[-135,-144,22,2]
 ]);
 assert.equal(Sim.blocked(-135,-126,.85,s.obstacles),true);
 assert.equal(Sim.blocked(-135,-144,.85,s.obstacles),true);
 assert.equal(Sim.blocked(-135,-135,.85,s.obstacles),false);
 assert.equal(Sim.lineBlocked(-135,-135,-135,-119,s.obstacles),true);
 assert.equal(Sim.lineBlocked(-145,-135,-125,-135,s.obstacles),false);
 const walker={x:-145,z:-135};
 Sim.moveEntity(walker,10,0,1,s.obstacles,.85);
 assert.ok(walker.x>-136&&walker.x<-134.5);
 assert.equal(walker.z,-135);
});

test('new west-quay geometry is present in both 3D renderers and deterministic saved BR worlds',()=>{
 const render=fs.readFileSync(path.join(__dirname,'../src/renderer.js'),'utf8');
 const native=fs.readFileSync(path.join(__dirname,'../Unreal/Veilpoint/Source/Veilpoint/VPWorldBootstrap.cpp'),'utf8');
 assert.match(render,/if\(o\.type==='dock-breakwater'\)/);
 assert.match(render,/if\(o\.type==='dock-bollard'\)/);
 assert.match(native,/FVector\(-13500\.f,-12600\.f,115\.f\)/);
 assert.match(native,/FVector\(-13500\.f,-14400\.f,115\.f\)/);
 assert.match(native,/FVector\(-15100\.f,-13500\.f,150\.f\)/);
 for(const seed of [42,101,2026,20261107]){
  const game=Sim.newMatch(seed,18);
  game.status='playing';
  const checkpoint=Sim.snapshotMatch(game);
  const restored=Sim.restoreMatch(checkpoint);
  assert.equal(restored.obstacles.filter(x=>x.type==='dock-breakwater').length,2);
  assert.equal(restored.bots.length,game.bots.length);
  assert.equal(restored.loot.length,40);
  assert.equal(Sim.snapshotMatch(restored),checkpoint,'roundtrip must retain seeded world');
 }
});
