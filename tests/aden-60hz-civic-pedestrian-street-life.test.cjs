'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Explorer=require('../src/aden-city-explorer.js');
const Districts=require('../src/aden-preview-districts.js');
const Story=require('../src/story-slice.js');
function ui(){
 const nodes=new Map(),canvas={width:1280,height:720,
   clientWidth:1280,clientHeight:720,
   getContext(){return {fillRect(){},strokeRect(){},beginPath(){},
     moveTo(){},lineTo(){},closePath(){},fill(){},stroke(){}};}};
 const status={textContent:''};
 const doc={getElementById(id){
  if(id==='terrainCanvas')return canvas;
  if(id==='tileStatus')return status;
  if(!nodes.has(id))nodes.set(id,{
   attributes:{},hidden:false,textContent:'',setAttribute(k,v){this.attributes[k]=v;},
   addEventListener(){}});
  return nodes.get(id);
 }};
 return {app:Explorer.attach(doc),status};
}
test('actual fictional civic world simulates several physically present street pedestrians at 60Hz',()=>{
 const {app,status}=ui();
 const original=Story.serialize(Story.createState());
 assert.equal(app.getCivicWalkers().length,0,'not a fake world-wide BR crowd');
 assert.equal(app.toggleWalking(),true);
 const before=app.getCivicWalkers();
 assert.ok(before.length>=4&&before.length<=Districts.PUBLIC_INTERIORS.length,
  'residents exist only beside collision-checked, loaded public rooms');
 assert.ok(Object.isFrozen(before)&&before.every(Object.isFrozen));
 assert.equal(new Set(before.map(x=>x.id)).size,before.length);
 assert.ok(before.every(x=>x.tick===0));
 assert.equal(app.walkStep({east:0,south:0},60),true);
 const after=app.getCivicWalkers();
 assert.equal(after.length,before.length);
 let moved=0;
 for(const first of before){
  const next=after.find(x=>x.id===first.id);
  assert.ok(next);
  assert.equal(next.tick,60,'public street bodies use the same sixty fixed ticks');
  const distance=Math.hypot(next.x-first.x,next.z-first.z);
  assert.ok(distance<=1.7+1e-7,'no teleport or unphysical sprinting');
  assert.equal(next.z,first.z,'each original sidewalk stays on its authored street');
  assert.ok(Number.isFinite(next.y));
  if(distance>.3)moved++;
 }
 assert.ok(moved>=2,'the civilians must actually walk, not merely decorate the map');
 assert.match(status.textContent,/실제 보행자/);
 assert.equal(Story.serialize(Story.restore(original)),original,
  'fictional preview cannot modify CH01 or BR checkpoint formats');
});
test('civic pedestrians re-ground or leave on streamed terrain changes, and disappear when PC walk ends',()=>{
 const {app}=ui();
 app.focusNextPublicRoom();
 assert.equal(app.toggleWalking(),true);
 app.walkStep({east:0},35);
 const before=app.getCivicWalkers();
 assert.ok(before.length>1);
 app.action('zoomOut');app.action('zoomOut');
 // Force a real new-LOD world build and one genuine fixed simulation tick.
 assert.equal(app.walkStep({east:0,south:0},1),true);
 const next=app.getCivicWalkers();
 assert.ok(next.length<=8);
 for(const after of next){
  const earlier=before.find(x=>x.id===after.id);
  if(earlier){
   assert.ok(Math.hypot(after.x-earlier.x,after.z-earlier.z)<=1.7/60+1e-8,
    'streamed LOD refresh may walk just one physical tick, never teleport');
   assert.ok(Math.abs(after.y-earlier.y)<=.35+1e-8);
  }
 }
 assert.equal(app.toggleWalking(),false);
 assert.equal(app.getCivicWalkers().length,0,
  'preview-only residents never persist into imported world or story/BR mode');
});
test('civic residents are absent when a local imported DEM is unreviewed and cannot be walked',()=>{
 const {app}=ui();
 const terrain={format:'veilpoint-heightfield-v1',
  coordinateSystem:'local-metre-unreferenced',title:'External unverified local terrain',
  tiles:[{tx:0,tz:0,gridSize:17,source:Explorer.SOURCE,
   samples:Array(17*17).fill(14)}]};
 app.loadDataset(terrain);
 assert.equal(app.toggleWalking(),false);
 assert.equal(app.getCivicWalkers().length,0);
 app.resetSample();
 assert.equal(app.toggleWalking(),true);
 assert.ok(app.getCivicWalkers().length>0);
});


test('original public-street residents and the player cannot walk through one another at 60Hz',()=>{
 const {app}=ui(),room=Districts.PUBLIC_INTERIORS[0];
 assert.equal(app.focusNextPublicRoom(),room.id);
 assert.equal(app.toggleWalking(),true);
 const id=room.id;
 const actor=app.getCivicWalkers().find(x=>x.id===id);
 assert.ok(actor,'the selected loaded original civic room has a local human');
 assert.ok(actor.x>app.getWalk().x+3,'resident starts ahead on the sidewalk');
 let closest=Infinity;
 for(let i=0;i<260;i++){
  app.walkStep({east:1,south:0},1);
  const now=app.getCivicWalkers().find(x=>x.id===id);
  if(!now)continue;
  const distance=Math.hypot(now.x-app.getWalk().x,now.z-app.getWalk().z);
  closest=Math.min(closest,distance);
  assert.ok(distance>=.9-1e-7,
   'neither 60Hz movement controller may overlap a physically present body');
 }
 assert.ok(closest<2.1,'the test really approached a civilian rather than checking empty space');
});
