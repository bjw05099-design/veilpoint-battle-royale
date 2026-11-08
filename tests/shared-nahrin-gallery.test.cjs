'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const Sim=require('../src/simulation.js');
const Story=require('../src/story-slice.js');
const gallery=world=>world.obstacles.filter(o=>o.type.startsWith('aden-gallery-'))
 .map(({x,z,w,d,h,type})=>({x,z,w,d,h,type}));
const expected=[
 {x:-78,z:105,w:.65,d:.65,h:3.2,type:'aden-gallery-post'},
 {x:-58,z:105,w:.65,d:.65,h:3.2,type:'aden-gallery-post'},
 {x:-78,z:119,w:.65,d:.65,h:3.2,type:'aden-gallery-post'},
 {x:-58,z:119,w:.65,d:.65,h:3.2,type:'aden-gallery-post'},
 {x:-76,z:113,w:2.6,d:1.6,h:1.1,type:'aden-gallery-counter'},
 {x:-60,z:113,w:2.6,d:1.6,h:1.1,type:'aden-gallery-counter'}
];
test('same six real gallery solids appear in BR and CH01 without sealing the public crossing',()=>{
 const br=Sim.newMatch(4321,0),ch=Story.createState().world;
 for(const world of [br,ch]){
  assert.deepEqual(gallery(world),expected);
  for(const solid of expected)assert.equal(
   Sim.blocked(solid.x,solid.z,.85,world.obstacles),true);
  assert.equal(Sim.blocked(-68,112,.85,world.obstacles),false);
  const pedestrian={x:-68,z:99};
  for(let i=0;i<360;i++)Sim.moveEntity(
   pedestrian,0,5,1/60,world.obstacles,.85);
  assert.ok(pedestrian.z>124,
   'player crosses a continuous 25m public corridor in true fixed steps');
  assert.equal(pedestrian.x,-68,'no scripted lateral teleport around gallery stalls');
 }
 const renderer=fs.readFileSync(path.resolve(__dirname,'../src/renderer.js'),'utf8');
 assert.match(renderer,/if\(o\.type==='aden-gallery-post'\)/);
 assert.match(renderer,/if\(o\.type==='aden-gallery-counter'\)/);
});
test('old revision-zero BR geography and existing CH01 v2 checkpoints still restore',()=>{
 const old=Sim.newMatch(4321,0,undefined,false,'central','day',0);
 old.status='playing';
 assert.deepEqual(gallery(old),[]);
 assert.deepEqual(gallery(Sim.restoreMatch(Sim.snapshotMatch(old))),[]);
 const current=Sim.newMatch(4321,0);
 current.status='playing';
 assert.deepEqual(gallery(Sim.restoreMatch(Sim.snapshotMatch(current))),expected);
 const story=Story.createState(),raw=Story.serialize(story);
 assert.equal(Story.serialize(Story.restore(raw)),raw);
 assert.deepEqual(gallery(Story.restore(raw).world),expected);
});
test('native UE5 blockout carries the exact browser coordinates for every shared gallery solid',()=>{
 const native=fs.readFileSync(path.resolve(__dirname,
  '../Unreal/Veilpoint/Source/Veilpoint/VPWorldBootstrap.cpp'),'utf8');
 const anchor='static const FSharedPublicBlock SharedCivilianGallery[] = {';
 const begin=native.indexOf(anchor),end=native.indexOf(
  'for (const FSharedPublicBlock& Block : SharedCivilianGallery)',begin);
 assert.ok(begin>native.indexOf('void AVPWorldBootstrap::BeginPlay()'));
 assert.ok(end>begin);
 const tuples=[...native.slice(begin,end).matchAll(
  /\{\s*([-\d.]+)f,\s*([-\d.]+)f,\s*([-\d.]+)f,\s*([-\d.]+)f,\s*([-\d.]+)f\s*\}/g)]
  .map(x=>x.slice(1).map(Number));
 assert.deepEqual(tuples,expected.map(({x,z,w,d,h})=>[x,z,w,d,h]));
 const split=native.indexOf('if(IsA(AVPStoryWorldBootstrap::StaticClass()))',begin);
 assert.ok(end<split,'shared bodies exist before story and BR mode branch');
 assert.match(native.slice(end,split),/AddBlock\(Buildings,FVector\(Block\.X\*100\.f/);
});
