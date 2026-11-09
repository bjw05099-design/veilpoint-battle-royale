'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const Sim=require('../src/simulation.js'),Story=require('../src/story-slice.js');
const source=fs.readFileSync(path.resolve(__dirname,
 '../Unreal/Veilpoint/Source/Veilpoint/VPWorldBootstrap.cpp'),'utf8');
const renderer=fs.readFileSync(path.resolve(__dirname,'../src/renderer.js'),'utf8');
const native=()=>{
 const start=source.indexOf('static const FSharedPublicBlock CivicRainCourt[] = {');
 const end=source.indexOf('for(const FSharedPublicBlock& Body : CivicRainCourt)',start);
 assert.ok(start>0&&end>start);
 return [...source.slice(start,end).matchAll(
  /\{([-\d.]+)f,([-\d.]+)f,([-\d.]+)f,([-\d.]+)f,([-\d.]+)f\}/g)]
   .map(row=>row.slice(1).map(Number));
};
test('Unreal C++ and actual BR/CH01 collision worlds share 16 identical civic raincourt footprints',()=>{
 const n=native(),browser=w=>w.obstacles.filter(b=>b.type.startsWith('aden-raincourt-'))
  .map(b=>[b.x,b.z,b.w,b.d,b.h]);
 assert.equal(n.length,16);
 assert.deepEqual(n,browser(Sim.newMatch(55,0)));
 assert.deepEqual(n,browser(Story.createState().world));
 assert.match(source,/AddBlock\(Buildings,FVector\(Body\.X\*100\.f,Body\.Z\*100\.f,Body\.H\*50\.f\)/);
 const insert=source.indexOf('static const FSharedPublicBlock CivicRainCourt[] = {'),
  branch=source.indexOf('if(IsA(AVPStoryWorldBootstrap::StaticClass()))',insert);
 assert.ok(branch>insert,'civil architecture must be instantiated on all native peers');
});
test('both native side roofs align with visible WebGL/Canvas and stay above walkable capsule',()=>{
 assert.match(renderer,/const RAINCOURT_CANOPIES=Object\.freeze\(\[/);
 assert.match(renderer,/x:-90,z:-12,w:10,d:20,roofY:3\.74,h:\.15/);
 assert.match(renderer,/x:-70,z:-12,w:10,d:20,roofY:3\.74,h:\.15/);
 for(const x of [-9000,-7000]){
  assert.ok(source.includes('FVector('+x+'.f,-1200.f,381.5f)'));
 }
 assert.equal(Number((3.815-.15/2).toFixed(4)),3.74);
 assert.match(renderer,/if\(o\.type\.startsWith\('aden-raincourt-'\)\)/);
 for(const type of ['wall','dry-basin','seat','post'])
  assert.match(renderer,new RegExp("o\\.type==='aden-raincourt-"+type+"'"));
 assert.match(source,/AddBlock\(Vegetation,FVector\(-8000\.f,-1200\.f,1\.f\)/);
 assert.match(source,/Vegetation->SetCollisionEnabled\(ECollisionEnabled::NoCollision\)/);
});
