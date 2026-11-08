'use strict';
// This verifies source-level geometry only: real UE5 UBT/PIE/Win64 packaging
// is still required before calling the native build playable or tested.
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const Sim=require('../src/simulation.js'),Story=require('../src/story-slice.js');
const native=fs.readFileSync(path.resolve(__dirname,
 '../Unreal/Veilpoint/Source/Veilpoint/VPWorldBootstrap.cpp'),'utf8');
const arrayStart='static const FSharedPublicBlock SharedCoastalPromenade[] = {';
const loop='for (const FSharedPublicBlock& Block : SharedCoastalPromenade)';
const geometry=world=>world.obstacles.filter(o=>o.type.startsWith('aden-promenade-'))
 .map(({x,z,w,d,h})=>[x,z,w,d,h]);

test('native world contains the exact six shared BR/CH01 coastal promenade bodies',()=>{
 const start=native.indexOf(arrayStart),end=native.indexOf(loop,start);
 assert.ok(start>0&&end>start,'native promenade must be constructed as actual blocks');
 const tuples=[...native.slice(start,end).matchAll(
  /\{\s*([-\d.]+)f,\s*([-\d.]+)f,\s*([-\d.]+)f,\s*([-\d.]+)f,\s*([-\d.]+)f\s*\}/g)]
  .map(m=>m.slice(1).map(Number));
 assert.equal(tuples.length,6,'four columns plus two low seats');
 assert.deepEqual(tuples,geometry(Sim.newMatch(551,0)));
 assert.deepEqual(tuples,geometry(Story.createState().world));
 assert.match(native.slice(end,end+180),
  /AddBlock\(Buildings,FVector\(Block\.X\*100\.f,Block\.Z\*100\.f,Block\.H\*50\.f\)/);
 assert.match(native.slice(end,end+220),/FVector\(Block\.W,Block\.D,Block\.H\)/);
});

test('native shared promenade is constructed for server and clients before story/BR separation',()=>{
 const play=native.indexOf('void AVPWorldBootstrap::BeginPlay()');
 const common=native.indexOf(arrayStart,play);
 const storySplit=native.indexOf('if(IsA(AVPStoryWorldBootstrap::StaticClass()))',common);
 const authority=native.indexOf('if(HasAuthority())',common);
 assert.ok(play>=0&&common>play&&storySplit>common&&authority>storySplit);
 assert.doesNotMatch(native.slice(common,storySplit),
  /if\s*\(HasAuthority\(\)\)|SpawnActor|ReadOriginalDeploymentOrder/);
 const br=Sim.newMatch(551,0),story=Story.createState().world;
 for(const world of [br,story]){
  const p={x:-28,z:62};
  for(let i=0;i<550;i++)Sim.moveEntity(p,0,5,1/60,world.obstacles,.85);
  assert.ok(p.z>100,'continuous public lane must be walkable in both browser modes');
  for(const obstacle of world.obstacles.filter(o=>o.type.startsWith('aden-promenade-')))
   assert.equal(Sim.blocked(obstacle.x,obstacle.z,.85,world.obstacles),true);
 }
});
