'use strict';
// Native C++ data parity is source-only preflight: no Unreal UBT/PIE claim.
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const Sim=require('../src/simulation.js'),Story=require('../src/story-slice.js');
const cpp=fs.readFileSync(path.resolve(__dirname,'../Unreal/Veilpoint/Source/Veilpoint/VPWorldBootstrap.cpp'),'utf8');
test('native UE5 ferry hall contains precisely the seven original shared public browser collision bodies',()=>{
 const start=cpp.indexOf('static const FSharedFerryBody SharedFerryHall[] = {');
 const end=cpp.indexOf('for (const FSharedFerryBody& Block : SharedFerryHall)',start);
 assert.ok(start>0&&end>start);
 const actual=[...cpp.slice(start,end).matchAll(/\{\s*([-\d.]+)f,\s*([-\d.]+)f,\s*([-\d.]+)f,\s*([-\d.]+)f,\s*([-\d.]+)f\s*\}/g)]
  .map(x=>x.slice(1).map(Number));
 const browser=game=>game.obstacles.filter(o=>o.type?.startsWith('aden-ferry-hall-'))
  .map(o=>[o.x,o.z,o.w,o.d,o.h]);
 const story=Story.createState().world;
 const br=Sim.newMatch(20261108,0);
 assert.equal(actual.length,7);
 assert.deepEqual(actual,browser(br));
 assert.deepEqual(actual,browser(story));
 assert.match(cpp,/FVector\(Block.X\*100.f,Block.Z\*100.f,Block.H\*50.f\)/);
 assert.match(cpp,/FVector\(Block.W,Block.D,Block.H\)/);
});
test('ferry world is shared before native BR/story mode split and central corridor remains physically open',()=>{
 const shared=cpp.indexOf('static const FSharedFerryBody SharedFerryHall[]');
 const branch=cpp.indexOf('if(IsA(AVPStoryWorldBootstrap::StaticClass()))',shared);
 const market=cpp.indexOf('static const FSharedMarketBlock SharedMarket[]');
 assert.ok(market>0&&shared>market&&branch>shared);
 const a=Sim.newMatch(7,0),b=Story.createState().world;
 for(const [x,z] of [[-45,125],[-45,134],[-45,140],[-45,145],[-45,151]]){
  assert.equal(Sim.blocked(x,z,.85,a.obstacles),false,'BR ferry corridor '+x+','+z);
  assert.equal(Sim.blocked(x,z,.85,b.obstacles),false,'CH01 ferry corridor '+x+','+z);
 }
 // This is public passenger architecture, NOT a 96-person online combat
 // facility or an invisible requirement to investigate a document.
 assert.doesNotMatch(cpp.slice(shared,branch),/ReadHarbor|ReadShelter|OriginalDeploymentOrder/);
});
