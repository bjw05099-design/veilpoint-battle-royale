'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const Sim=require('../src/simulation.js'),Story=require('../src/story-slice.js');
const cpp=fs.readFileSync(path.resolve(__dirname,
 '../Unreal/Veilpoint/Source/Veilpoint/VPWorldBootstrap.cpp'),'utf8');
function nativeBodies(){
 const start=cpp.indexOf('static const FSharedPublicBlock SharedCraftHall[] = {');
 const end=cpp.indexOf('for (const FSharedPublicBlock& Block : SharedCraftHall)',start);
 assert.ok(start>0&&end>start,'UE5 native geometry must exist as real instantiated bodies');
 return [...cpp.slice(start,end).matchAll(
  /\{\s*([-\d.]+)f,\s*([-\d.]+)f,\s*([-\d.]+)f,\s*([-\d.]+)f,\s*([-\d.]+)f\s*\}/g)]
  .map(m=>m.slice(1).map(Number));
}
const browserBodies=world=>world.obstacles.filter(o=>o.type.startsWith('aden-craft-'))
 .map(o=>[o.x,o.z,o.w,o.d,o.h]);
test('native shared public craft neighborhood equals all 18 BR and CH01 solid footprints',()=>{
 const native=nativeBodies();
 assert.equal(native.length,18);
 assert.deepEqual(native,browserBodies(Sim.newMatch(902,0)));
 assert.deepEqual(native,browserBodies(Story.createState().world));
 const loop=cpp.slice(cpp.indexOf('for (const FSharedPublicBlock& Block : SharedCraftHall)'),
  cpp.indexOf('static const FSharedPublicBlock CraftCanopies[]'));
 assert.match(loop,/AddBlock\(Buildings,FVector\(Block\.X\*100\.f,Block\.Z\*100\.f,Block\.H\*50\.f\)/);
 assert.match(loop,/FVector\(Block\.W,Block\.D,Block\.H\)/);
});
test('UE5 map has 2 genuinely raised interior roofs and a separate shaded forecourt',()=>{
 const start=cpp.indexOf('static const FSharedPublicBlock CraftCanopies[] = {');
 const end=cpp.indexOf('static const float CraftRoofCenterCm[]',start);
 const roofs=[...cpp.slice(start,end).matchAll(
  /\{\s*([-\d.]+)f,\s*([-\d.]+)f,\s*([-\d.]+)f,\s*([-\d.]+)f,\s*([-\d.]+)f\s*\}/g)]
  .map(m=>m.slice(1).map(Number));
 assert.deepEqual(roofs,[
  [-75,35,9,26,.16],[-51,35,9,26,.16],[-63,60.5,28,7,.15]
 ]);
 assert.match(cpp,/CraftRoofCenterCm\[\] = \{373\.f,373\.f,334\.5f\}/);
 assert.match(cpp,/AddBlock\(Buildings,FVector\(Roof\.X\*100\.f,Roof\.Z\*100\.f,CraftRoofCenterCm\[i\]\)/);
 assert.match(cpp,/AddBlock\(Ground,FVector\(-6300\.f,3600\.f,-4\.f\)/);
 assert.match(cpp,/AddBlock\(Ground,FVector\(-6300\.f,6060\.f,-4\.f\)/);
 const actualRoofBottom=roofs.map((r,i)=>[373,373,334.5][i]/100-r[4]/2);
 assert.deepEqual(actualRoofBottom.map(v=>Number(v.toFixed(4))),[3.65,3.65,3.27],
  'UE5 centered roof transforms must equal the visible WebGL bottom elevation');
 assert.ok(actualRoofBottom.every(h=>h>3.0),
  'overhead shade never blocks the on-foot capsule at body height');
});
test('native map expansion runs on host and clients before the BR/CH01 world split',()=>{
 const common=cpp.indexOf('static const FSharedPublicBlock SharedCraftHall[] = {');
 const split=cpp.indexOf('if(IsA(AVPStoryWorldBootstrap::StaticClass()))');
 const begin=cpp.indexOf('void AVPWorldBootstrap::BeginPlay()');
 assert.ok(begin>=0&&common>begin&&split>common);
 const block=cpp.slice(common,split);
 assert.doesNotMatch(block,/if\s*\(HasAuthority\(\)\)|SpawnActor|Enemy|ClientRPC/);
 assert.match(cpp,/bReplicates=true/);
 assert.match(cpp,/Buildings->SetCollisionEnabled\(ECollisionEnabled::QueryAndPhysics\)/);
 assert.match(cpp,/Buildings->SetCollisionResponseToChannel\(ECC_Visibility,ECR_Block\)/);
});
