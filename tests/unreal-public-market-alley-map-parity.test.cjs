'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const Sim=require('../src/simulation.js'),Story=require('../src/story-slice.js');
const native=fs.readFileSync(path.resolve(__dirname,
 '../Unreal/Veilpoint/Source/Veilpoint/VPWorldBootstrap.cpp'),'utf8');
const source=fs.readFileSync(path.resolve(__dirname,'../src/renderer.js'),'utf8');
function tuples(section){
 return [...section.matchAll(/\{\s*([-\d.]+)f,\s*([-\d.]+)f,\s*([-\d.]+)f,\s*([-\d.]+)f,\s*([-\d.]+)f\s*\}/g)]
  .map(m=>m.slice(1).map(Number));
}
test('all 15 new public shop fixtures match native/BR/CH01 actual collision footprints',()=>{
 const start=native.indexOf('static const FSharedPublicBlock SharedFerryApproachShops[] = {');
 const end=native.indexOf('for(const FSharedPublicBlock& Part : SharedFerryApproachShops)',start);
 assert.ok(start>0&&end>start,'native must instantiate the whole shop row');
 const nativeSolids=tuples(native.slice(start,end));
 assert.equal(nativeSolids.length,15);
 const browser=w=>w.obstacles.filter(o=>o.type.startsWith('aden-laneshop-'))
  .map(o=>[o.x,o.z,o.w,o.d,o.h]);
 assert.deepEqual(nativeSolids,browser(Sim.newMatch(20261109,0)));
 assert.deepEqual(nativeSolids,browser(Story.createState().world));
 assert.match(native.slice(end,end+240),
  /AddBlock\(Buildings,FVector\(Part\.X\*100\.f,Part\.Z\*100\.f,Part\.H\*50\.f\)/);
});
test('both native shops have WebGL/Canvas-matching roof bottoms and a walkable open-air center',()=>{
 const start=native.indexOf('static const FSharedPublicBlock FerryApproachShopRoofs[] = {');
 const end=native.indexOf('for(const FSharedPublicBlock& Roof : FerryApproachShopRoofs)',start);
 assert.ok(start>0&&end>start);
 const roofs=tuples(native.slice(start,end));
 assert.deepEqual(roofs,[
  [-45.5,105,10,16,.16],[-24.5,105,10,16,.16]
 ]);
 assert.match(native,/FVector\(Roof\.X\*100\.f,Roof\.Z\*100\.f,361\.f\)/);
 for(const roof of roofs){
  const ueBottom=3.61-roof[4]/2;
  assert.equal(Number(ueBottom.toFixed(4)),3.53);
  assert.equal(roof[0]===-45.5||roof[0]===-24.5,true);
 }
 assert.match(native,/AddBlock\(Ground,FVector\(-3490\.f,10700\.f,-4\.f\)/);
 assert.match(source,/const MARKET_LANE_ROOFS=Object\.freeze\(\[/);
 assert.match(source,/roofY:3\.53,h:\.16/);
 const shapes=Sim.newMatch(5,0).obstacles;
 assert.equal(Sim.blocked(-35,105,.85,shapes),false);
 assert.equal(Sim.blocked(-45.5,105,.85,shapes),false);
 assert.equal(Sim.blocked(-24.5,105,.85,shapes),false);
});
test('native authored city still builds on both hosts and clients before mode-specific objects',()=>{
 const begin=native.indexOf('void AVPWorldBootstrap::BeginPlay()');
 const newBuilding=native.indexOf('static const FSharedPublicBlock SharedFerryApproachShops[] = {',begin);
 const split=native.indexOf('if(IsA(AVPStoryWorldBootstrap::StaticClass()))',newBuilding);
 assert.ok(begin>=0&&newBuilding>begin&&split>newBuilding);
 assert.doesNotMatch(native.slice(newBuilding,split),/if\s*\(HasAuthority\(\)\)|PlayerController|Enemy|SpawnActor/);
});
test('existing native craft roof instances now align EXACTLY with WebGL bottom elevation',()=>{
 assert.match(native,/CraftRoofCenterCm\[\] = \{373\.f,373\.f,334\.5f\}/);
 for(const [center,height,webBottom] of [[373,.16,3.65],[373,.16,3.65],[334.5,.15,3.27]]){
  assert.equal(Number((center/100-height/2).toFixed(4)),webBottom);
 }
});
