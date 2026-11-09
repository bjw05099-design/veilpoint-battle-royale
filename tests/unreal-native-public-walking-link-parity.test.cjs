'use strict';
// Source-level UE5 parity gate. Node does not compile UnrealBuildTool/PIE.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Sim=require('../src/simulation.js');
const Story=require('../src/story-slice.js');
const Footpaths=require('../src/public-city-footpaths.js');
const ue=fs.readFileSync(path.resolve(__dirname,
 '../Unreal/Veilpoint/Source/Veilpoint/VPWorldBootstrap.cpp'),'utf8');
const js=fs.readFileSync(path.resolve(__dirname,
 '../src/public-city-footpaths.js'),'utf8');
function parseNativeLinks(){
 const start=ue.indexOf('static const FPublicWalkingLink NativeLocalWalkingLinks[] = {');
 const end=ue.indexOf('for (const FPublicWalkingLink& Link : NativeLocalWalkingLinks)',start);
 assert.ok(start>0&&end>start,'native road connectors must be real geometry');
 const rows=[...ue.slice(start,end).matchAll(
  /\{FVector2D\(([-\d.]+)f,([-\d.]+)f\), FVector2D\(([-\d.]+)f,([-\d.]+)f\)\}/g)];
 return rows.map(r=>r.slice(1).map(Number));
}
function parseJsLinks(){
 const start=js.indexOf('const LOCAL_MAP_LINKS=Object.freeze([');
 const end=js.indexOf('function planLocalPaths(',start);
 assert.ok(start>=0&&end>start);
 return [...js.slice(start,end).matchAll(
  /id:'([^']+)',\s*from:Object\.freeze\(\{x:([-\d.]+),z:([-\d.]+)\}\),to:Object\.freeze\(\{x:([-\d.]+),z:([-\d.]+)\}\)/g)]
  .map(r=>({id:r[1],coords:r.slice(2).map(Number)}));
}
test('UE5 coastal walkway endpoints exactly match all four browser local public routes',()=>{
 const browser=parseJsLinks(),native=parseNativeLinks();
 assert.equal(browser.length,4);
 assert.equal(native.length,4);
 assert.deepEqual(native,browser.map(p=>p.coords));
 assert.deepEqual(browser.map(b=>b.id),[
  'craft-to-promenade','promenade-to-shop-street',
  'shop-street-through','shop-street-to-ferry']);
 for(const coords of native)
  assert.ok(coords.every(Number.isFinite),'native route cannot be malformed');
});
test('all four native straight paved links follow genuinely unobstructed 60Hz public streets in both game modes',()=>{
 for(const world of [Sim.newMatch(19771,0),Story.createState().world]){
  const routes=Footpaths.planLocalPaths(world.obstacles);
  assert.equal(routes.length,4);
  const native=parseNativeLinks();
  for(let i=0;i<routes.length;i++){
   const road=routes[i];
   assert.equal(road.walkable,true,'blocked corridor: '+road.id);
   assert.deepEqual([road.from.x,road.from.z,road.to.x,road.to.z],native[i]);
   assert.equal(road.points.length,2,
    'native single straight paving must never falsely cross a browser path detour: '+road.id);
   const [ax,az,bx,bz]=native[i];
   for(let k=0;k<=120;k++){
    const t=k/120,x=ax+(bx-ax)*t,z=az+(bz-az)*t;
    assert.equal(Sim.blocked(x,z,Footpaths.CLEARANCE,world.obstacles),false,
     'visible road corridor must be passable by the body at '+road.id+' '+t);
   }
  }
 }
});
test('native paving uses an actual rotated, noncolliding public mesh before mode split',()=>{
 const start=ue.indexOf('static const FPublicWalkingLink NativeLocalWalkingLinks[] = {');
 const stop=ue.indexOf('// Branch on the replicated actor CLASS',start);
 const split=ue.indexOf('if(IsA(AVPStoryWorldBootstrap::StaticClass()))',stop);
 const segment=ue.slice(start,stop);
 assert.ok(start>0&&stop>start&&split>stop);
 assert.match(ue,/Vegetation->SetCollisionEnabled\(ECollisionEnabled::NoCollision\)/);
 assert.match(segment,/const FVector2D Span=Link\.To-Link\.From/);
 assert.match(segment,/FMath::RadiansToDegrees\(FMath::Atan2\(Span\.Y,Span\.X\)\)/);
 assert.match(segment,/Vegetation->AddInstance\(FTransform\(FRotator\(0\.f,Angle,0\.f\)/);
 assert.match(segment,/FVector\(Mid\.X\*100\.f,Mid\.Y\*100\.f,1\.5f\)/);
 assert.match(segment,/FVector\(Length,1\.3f,\.03f\)/);
 assert.doesNotMatch(segment,/if\s*\(HasAuthority\(\)\)|SpawnActor|Buildings->AddInstance|GetPlayerController/);
});
test('road draw remains present on WebGL and Canvas and never breaks historic 0-terrain world',()=>{
 const renderer=fs.readFileSync(path.resolve(__dirname,'../src/renderer.js'),'utf8');
 assert.match(renderer,/PublicFootpaths\.planLocalPaths\(state\.obstacles\)/);
 assert.match(renderer,/PublicFootpaths\.planLocalPaths\(sim\.obstacles\)/);
 const historic=Sim.newMatch(19771,0,'carbine',false,'central','day',0);
 assert.deepEqual(Footpaths.planLocalPaths(historic.obstacles),[]);
 const scene=Story.createState(),saved=Story.serialize(scene);
 assert.equal(Story.serialize(Story.restore(saved)),saved);
 assert.deepEqual(Footpaths.planLocalPaths(Story.restore(saved).world.obstacles),
  Footpaths.planLocalPaths(scene.world.obstacles));
});
