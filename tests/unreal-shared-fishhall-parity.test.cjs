'use strict';
// C++ source preflight: the Windows UE5 editor/UBT is still needed for a native certification.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const Sim=require('../src/simulation.js'),Story=require('../src/story-slice.js');
const source=fs.readFileSync(path.resolve(__dirname,
 '../Unreal/Veilpoint/Source/Veilpoint/VPWorldBootstrap.cpp'),'utf8');
function nativeFishHall(){
 const from=source.indexOf('static const FSharedFishHallBody SharedFishHall[] = {');
 const end=source.indexOf('for (const FSharedFishHallBody& Block : SharedFishHall)',from);
 assert.ok(from>0&&end>from,'Native public hall bodies must be instantiated on both modes');
 return [...source.slice(from,end).matchAll(/\{\s*([-\d.]+)f,\s*([-\d.]+)f,\s*([-\d.]+)f,\s*([-\d.]+)f,\s*([-\d.]+)f\s*\}/g)]
  .map(m=>m.slice(1).map(Number));
}
const sourceBodies=world=>world.obstacles.filter(o=>o.type?.startsWith('aden-fishhall-'))
 .map(o=>[o.x,o.z,o.w,o.d,o.h]);
test('five UE5-native public fish hall solids match the one common browser world, in BR and CH01',()=>{
 const solids=nativeFishHall(),br=Sim.newMatch(1003,0),ch=Story.createState();
 assert.equal(solids.length,5);
 assert.deepEqual(solids,sourceBodies(br));
 assert.deepEqual(solids,sourceBodies(ch.world));
 assert.ok(source.indexOf('static const FSharedFishHallBody SharedFishHall[]')<
  source.indexOf('if(IsA(AVPStoryWorldBootstrap::StaticClass()))'));
 assert.match(source,/AddBlock\(Buildings,FVector\(Block.X\*100.f,Block.Z\*100.f,Block.H\*50.f\),\s*FVector\(Block.W,Block.D,Block.H\)\)/);
});
test('south opening is walkable while real walls and counters block feet in both story and BR',()=>{
 for(const w of [Sim.newMatch(1004,0),Story.createState().world]){
  for(const p of [{x:-154,z:105},{x:-154,z:112},{x:-154,z:121},{x:-154,z:126}])
   assert.equal(Sim.blocked(p.x,p.z,.85,w.obstacles),false,'open lane '+JSON.stringify(p));
  for(const [x,z] of [[-164,121],[-144,121],[-154,130],[-161,123],[-147,123]])
   assert.equal(Sim.blocked(x,z,.85,w.obstacles),true,'solid architecture '+x+','+z);
 }
});
test('native public hall does not appear in legacy terrain revision zero',()=>{
 const old=Sim.newMatch(1005,0,'carbine',false,'central','day',0);
 assert.equal(sourceBodies(old).length,0);
 assert.equal(sourceBodies(Sim.newMatch(1005,0)).length,5);
});
