'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const Sim=require('../src/simulation.js'),Story=require('../src/story-slice.js');
const native=fs.readFileSync(path.join(__dirname,'../Unreal/Veilpoint/Source/Veilpoint/VPWorldBootstrap.cpp'),'utf8');
function nativeGeometry(name){
 const from=native.indexOf('static const FSharedPublicBlock '+name+'[] = {');
 assert.ok(from>=0,name+' exists in native world blockout');
 const lines=native.slice(from,native.indexOf('};',from)).split('\n');
 const body=lines.filter(s=>s.trim().startsWith('{')).map(row=>{
  const nums=[...row.matchAll(/-?(?:\d+(?:\.\d*)?|\.\d+)f/g)].map(m=>Number(m[0].slice(0,-1)));
  assert.equal(nums.length,5,'exact native x,z,w,d,h data');
  return nums;
 });
 return body;
}
function browserGeometry(type){
 const game=Sim.newMatch(20261108,0,'carbine');
 return game.obstacles.filter(o=>o.type.startsWith(type))
  .map(o=>[o.x,o.z,o.w,o.d,o.h]);
}
test('native UE5 world blockout has all original shared-market-court solids at browser collision poses',()=>{
 const browser=browserGeometry('aden-market-court-'),ue=nativeGeometry('SharedMarketCourt');
 assert.equal(browser.length,10);
 assert.deepEqual(ue,browser);
 const story=Story.createState();
 assert.deepEqual(story.world.obstacles.filter(o=>o.type.startsWith('aden-market-court-'))
   .map(o=>[o.x,o.z,o.w,o.d,o.h]),browser);
});
test('native UE5 world blockout includes the eight new public-transit solids shared by BR and CH01',()=>{
 const browser=browserGeometry('aden-transit-court-'),ue=nativeGeometry('SharedTransitCourt');
 assert.equal(browser.length,8);
 assert.deepEqual(ue,browser);
 const story=Story.createState();
 assert.deepEqual(story.world.obstacles.filter(o=>o.type.startsWith('aden-transit-court-'))
   .map(o=>[o.x,o.z,o.w,o.d,o.h]),browser);
 assert.match(native,/for \(const FSharedPublicBlock& Block : SharedTransitCourt\)\s*AddBlock\(Buildings,/);
 assert.ok(native.indexOf('SharedTransitCourt')<native.indexOf('if(IsA(AVPStoryWorldBootstrap::StaticClass()))'),
   'native city collision is authored for both modes before the story/BR branch');
});
test('legacy revision-zero offline rounds retain the pre-court layouts',()=>{
 const old=Sim.newMatch(20261108,0,'carbine',false,'central','day',0);
 assert.equal(old.obstacles.filter(o=>o.type.startsWith('aden-market-court-')||
   o.type.startsWith('aden-transit-court-')).length,0);
});
