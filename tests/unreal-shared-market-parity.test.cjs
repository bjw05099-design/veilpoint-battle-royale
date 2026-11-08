'use strict';
// Unreal native source equivalence is a preflight only; UBT/PIE must still be
// run on a Windows machine with Unreal Engine 5.8 installed.
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const Sim=require('../src/simulation.js'),Story=require('../src/story-slice.js');
const native=fs.readFileSync(path.resolve(__dirname,'../Unreal/Veilpoint/Source/Veilpoint/VPWorldBootstrap.cpp'),'utf8');
test('UE5 native C++ uses identical six shared public-market footprints as BR and CH01 browser',()=>{
 const a=native.indexOf('static const FSharedMarketBlock SharedMarket[] = {');
 const b=native.indexOf('for (const FSharedMarketBlock& Block : SharedMarket)',a);
 assert.ok(a>0&&b>a);
 const entries=[...native.slice(a,b).matchAll(/\{\s*([-\d.]+)f,\s*([-\d.]+)f,\s*([-\d.]+)f,\s*([-\d.]+)f,\s*([-\d.]+)f\s*\}/g)]
   .map(m=>m.slice(1).map(Number));
 const fromWorld=game=>game.obstacles.filter(o=>o.type?.startsWith('aden-seafront-market-'))
   .map(o=>[o.x,o.z,o.w,o.d,o.h]);
 assert.equal(entries.length,6);
 assert.deepEqual(entries,fromWorld(Sim.newMatch(76,0)));
 assert.deepEqual(entries,fromWorld(Story.createState().world));
 assert.match(native,/FVector\(Block.X\*100.f,Block.Z\*100.f,Block.H\*50.f\)/);
 assert.match(native,/FVector\(Block.W,Block.D,Block.H\)/);
});
test('native market is created before story/BR branch and leaves a real walkable central street',()=>{
 const ground=native.indexOf('AddBlock(Ground,FVector(0,0,-70)');
 const common=native.indexOf('static const FSharedMarketBlock SharedMarket[]');
 const branch=native.indexOf('if(IsA(AVPStoryWorldBootstrap::StaticClass()))',common);
 assert.ok(ground>=0&&common>ground&&branch>common);
 const s=Story.createState();
 for(const p of [{x:28,z:137},{x:28,z:147},{x:28,z:156},{x:28,z:164}]){
  assert.equal(Sim.blocked(p.x,p.z,.85,s.world.obstacles),false,'walkable center '+JSON.stringify(p));
 }
});