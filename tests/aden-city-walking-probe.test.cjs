'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Tiles=require('../src/aden-citywide-tiles.js');
const Explorer=require('../src/aden-city-explorer.js');
const Districts=require('../src/aden-preview-districts.js');
const Walk=require('../src/aden-city-walking-probe.js');
function fixture(){
 const registry=Explorer.createPreviewRegistry(),cache=new Map();
 const ctx={fillStyle:'',strokeStyle:'',lineWidth:1,fillRect(){},
  strokeRect(){},beginPath(){},moveTo(){},lineTo(){},closePath(){},
  fill(){},stroke(){}};
 const canvas={width:1280,height:720,getContext:()=>ctx};
 Explorer.draw(canvas,registry,Explorer.viewState(),cache);
 const world=Walk.createWorld(registry,cache,new Set(cache.keys()),
  [...Explorer.CIVIC_SHELLS,...Districts.PLAN.buildings]);
 return {registry,cache,world,canvas};
}
test('civilian walking at 60Hz moves 1.7m in 60 ticks, independent of GPU frames',()=>{
 const {world}=fixture();
 let state=Walk.initial(world,0,0);
 for(let i=0;i<60;i++)state=Walk.step(world,state,{east:1});
 assert.equal(state.tick,60);
 assert.ok(Math.abs(state.x-1.7)<1e-9);
 assert.equal(state.z,0);
 assert.equal(world.surveyedAden,false);
 assert.equal(world.storyCollisionConnected,false);
 assert.equal(world.brCollisionConnected,false);
});
test('diagonal intent cannot exceed straight-line walking speed',()=>{
 const {world}=fixture();
 let s=Walk.initial(world,0,0);
 for(let i=0;i<60;i++)s=Walk.step(world,s,{east:1,south:1});
 assert.ok(Math.hypot(s.x,s.z)<=1.7+1e-9);
 assert.ok(Math.hypot(s.x,s.z)>1.6);
});
test('authored civilian homes reject capsule centre and retain outdoor ground',()=>{
 const {world}=fixture();
 const b=Districts.PLAN.buildings.find(h=>h.district==='fictional-central-arcade');
 assert.ok(b);
 assert.equal(Walk.probe(world,b.x,b.z),null);
 assert.ok(Walk.probe(world,b.x-b.w/2-.7,b.z));
 assert.equal(Walk.probe(world,b.x-b.w/2+.5,b.z),null);
});
test('unloaded terrain and sea are not silently treated as walkable',()=>{
 const {world}=fixture();
 assert.equal(Walk.probe(world,90000,90000),null);
 assert.equal(Walk.probe(world,NaN,0),null);
 assert.throws(()=>Walk.initial(world,90000,90000),RangeError);
 assert.throws(()=>Walk.step(world,{version:1,tick:0,x:0,y:0,z:0},{east:2}),RangeError);
});
test('viewer activates walk only in fictional sample and invalidates it on DEM import',()=>{
 const {canvas}=fixture();
 const elements=new Map(),status={textContent:''};
 const doc={getElementById(id){
  if(id==='terrainCanvas')return canvas;
  if(id==='tileStatus')return status;
  if(!elements.has(id))elements.set(id,{
   textContent:'',hidden:false,addEventListener(){},setAttribute(k,v){this[k]=v}});
  return elements.get(id);
 }};
 const app=Explorer.attach(doc);
 assert.equal(app.toggleWalking(),true);
 assert.equal(app.walkStep({east:1},10),true);
 assert.equal(app.getWalk().tick,10);
 const data={format:'veilpoint-heightfield-v1',
  coordinateSystem:'local-metre-unreferenced',title:'Unreviewed local sample',
  tiles:[{tx:0,tz:0,gridSize:17,source:Explorer.SOURCE,samples:Array(289).fill(33)}]};
 app.loadDataset(data);
 assert.equal(app.getWalk(),null);
 assert.equal(app.toggleWalking(),false);
 app.resetSample();
 assert.equal(app.toggleWalking(),true);
 assert.equal(elements.get('walkProbe')['aria-pressed'],'true');
});
