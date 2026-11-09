'use strict';
// Source-level C++/JS geography parity; only UE5 UBT + PIE can validate the engine build.
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const Sim=require('../src/simulation.js');
const Story=require('../src/story-slice.js');
const code=fs.readFileSync(path.resolve(__dirname,
 '../Unreal/Veilpoint/Source/Veilpoint/VPWorldBootstrap.cpp'),'utf8');
const land=Sim.ADEN_GEOGRAPHIC_VISTA;
function geoPeaks(symbol){
 const begin=code.indexOf('static const FAdenGeoPeak '+symbol+'[] = {');
 const end=code.indexOf('};',begin);
 assert.ok(begin>0&&end>begin,symbol+' native crest source is missing');
 return [...code.slice(begin,end).matchAll(/\{\s*([-\d.]+)f,\s*([-\d.]+)f\s*\}/g)]
  .map(m=>({x:+m[1],h:+m[2]}));
}
test('native Shamsan, bay-headland and isthmus crest profiles match all original 3 WebGL peak lists',()=>{
 for(const [i,symbol] of ['ShamsanArc','WesternBayHeadland','EasternIsthmusRise'].entries()){
  assert.deepEqual(geoPeaks(symbol),land.ridges[i].peaks);
 }
 assert.match(code,/AddDistantRidge\(ShamsanArc,UE_ARRAY_COUNT\(ShamsanArc\),258\.f\)/);
 assert.match(code,/AddDistantRidge\(WesternBayHeadland,UE_ARRAY_COUNT\(WesternBayHeadland\),226\.f\)/);
 assert.match(code,/AddDistantRidge\(EasternIsthmusRise,UE_ARRAY_COUNT\(EasternIsthmusRise\),280\.f\)/);
});
test('native western sea footprint corresponds exactly to nonplaying Sim ocean area',()=>{
 const ocean=land.ocean;
 assert.deepEqual([ocean.x*100,ocean.z*100,ocean.y*100,ocean.w,ocean.d],
  [-35600,8200,-24,356,630]);
 assert.match(code,/AddBlock\(Vegetation,FVector\(-35600\.f,8200\.f,-24\.f\),\s*FVector\(356\.f,630\.f,\.12f\)\)/);
 assert.ok(ocean.x+ocean.w/2 < -Sim.WORLD);
});
test('all 48 native low-rise houses use the shared deterministic geometry dimensions',()=>{
 const start=code.indexOf('for (int32 i=0;i<48;++i)');
 const end=code.indexOf('// Branch on the replicated actor CLASS',start);
 assert.ok(start>0&&end>start);
 const layout=code.slice(start,end);
 for(const re of [
  /const int32 Row=i\/12,Col=i%12/,
  /const float X=-157\.f\+float\(Col\*27\)\+\(Row%2\?6\.f:0\.f\)/,
  /const float Z=187\.f\+float\(Row\*12\)/,
  /const float Width=11\.f\+float\(\(\(i\+Row\)%3\)\*2\)/,
  /const float Depth=8\.f\+float\(\(\(i\+1\)%3\)\*2\)/,
  /const float Height=7\.f\+float\(\(i\*7\)%12\)/,
  /AddBlock\(Vegetation,FVector\(X\*100\.f,Z\*100\.f,Height\*50\.f\)/
 ])assert.match(layout,re);
 assert.equal(land.buildings.length,48);
 for(let i=0;i<48;i++){
  const home=land.buildings[i],row=Math.floor(i/12),col=i%12;
  assert.deepEqual({x:home.x,z:home.z,w:home.w,d:home.d,h:home.h},
   {x:-157+col*27+(row%2?6:0),z:187+row*12,
    w:11+(i+row)%3*2,d:8+(i+1)%3*2,h:7+(i*7)%12});
 }
});
test('all new native regional pieces are noncolliding, built before story/BR split and have no save flags',()=>{
 const start=code.indexOf('// ADEN REGIONAL DISTANCE GEOGRAPHY');
 const split=code.indexOf('if(IsA(AVPStoryWorldBootstrap::StaticClass()))',start);
 assert.ok(start>0&&split>start);
 const fragment=code.slice(start,split);
 assert.doesNotMatch(fragment,/AddBlock\((Ground|Buildings),|SpawnActor|HasAuthority\(\)/);
 assert.match(code,/Vegetation->SetCollisionEnabled\(ECollisionEnabled::NoCollision\)/);
 const story=Story.createState(),saved=Story.serialize(story);
 assert.equal(Story.serialize(Story.restore(saved)),saved);
});
