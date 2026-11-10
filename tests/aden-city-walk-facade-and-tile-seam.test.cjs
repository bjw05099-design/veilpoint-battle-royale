'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Tiles=require('../src/aden-citywide-tiles.js');
const Explorer=require('../src/aden-city-explorer.js');
const Districts=require('../src/aden-preview-districts.js');
const Walk=require('../src/aden-city-walking-probe.js');
const Story=require('../src/story-slice.js');
function preview(){
 const registry=Explorer.createPreviewRegistry(),cache=new Map();
 const ctx={fillRect(){},strokeRect(){},beginPath(){},moveTo(){},lineTo(){},
  closePath(){},fill(){},stroke(){}};
 Explorer.draw({width:1280,height:720,getContext:()=>ctx},registry,
  Explorer.viewState(),cache);
 const solids=[...Explorer.CIVIC_SHELLS,...Districts.PLAN.buildings];
 return Walk.createWorld(registry,cache,new Set(cache.keys()),solids);
}
function flat(tx,h){
 return Tiles.createHeightTile({tx,tz:0,gridSize:17,source:Explorer.SOURCE,
  samples:Array(17*17).fill(h)});
}
function cacheOf(registry){
 return new Map([...registry].map(([key,sourceTile])=>
  [key,{sourceTile,lod:2,mesh:Tiles.buildTerrainMesh(sourceTile,2)}]));
}
test('the actual authored building facade stops a swept 0.45m walking capsule, but allows lateral walking',()=>{
 const world=preview(),house=Districts.PLAN.buildings.find(
  b=>b.district==='fictional-central-arcade');
 const leftEdge=house.x-house.w/2-Walk.RADIUS_METRES;
 let player=Walk.initial(world,leftEdge-.3,house.z);
 for(let i=0;i<240;i++)player=Walk.step(world,player,{east:1});
 assert.ok(player.x<=leftEdge+.002,'capsule never enters a drawn home');
 assert.ok(player.x>leftEdge-.31,'approach reaches the facade');
 assert.equal(player.blocked,true);
 const beforeZ=player.z;
 for(let i=0;i<40;i++)player=Walk.step(world,player,{south:1});
 assert.ok(player.z>beforeZ+1,'facade does not prohibit movement along the wall');
 assert.equal(Walk.probe(world,house.x,house.z),null);
});
test('a 512m seam is traversable only after its neighboring physical terrain tile is loaded',()=>{
 const registry=Tiles.createRegistry([flat(0,20),flat(1,20)]),
  cache=cacheOf(registry),unknown=Walk.createWorld(registry,cache,
   new Set(['aden:0:0']),[]),
  joined=Walk.createWorld(registry,cache,new Set(registry.keys()),[]);
 let west=Walk.initial(unknown,510.2,240),east=Walk.initial(joined,510.2,240);
 for(let i=0;i<180;i++){
  west=Walk.step(unknown,west,{east:1});
  east=Walk.step(joined,east,{east:1});
 }
 assert.ok(west.x<=512-Walk.RADIUS_METRES+.001,
  'body remains on the known side of unloaded terrain');
 assert.equal(Walk.probe(unknown,512.5,240),null);
 assert.ok(east.x>512.5,'walk crosses loaded tile seam without teleportation');
 assert.equal(east.tick,west.tick);
 assert.ok(east.x-510.2<=180*Walk.SPEED_METRES_PER_SECOND/60+1e-9);
 const replaced=Tiles.createRegistry([registry.get('aden:0:0'),flat(1,20)]);
 const stale=Walk.createWorld(replaced,cache,new Set(replaced.keys()),[]);
 assert.equal(Walk.probe(stale,513,240),null,
  'a newer terrain revision cannot borrow the old mesh by coordinate alone');
});
test('underwater and steep triangles reject their entire body footprint; no campaign save field is added',()=>{
 const ocean=Tiles.createRegistry([flat(0,-5)]),
  ramp=Tiles.createRegistry([Tiles.createHeightTile({tx:0,tz:0,gridSize:17,
   source:Explorer.SOURCE,samples:Array.from({length:289},(_,i)=>
    20+(i%17)*32)})]);
 for(const registry of [ocean,ramp]){
  const walk=Walk.createWorld(registry,cacheOf(registry),new Set(registry.keys()),[]);
  assert.equal(Walk.probe(walk,120,120),null);
  assert.throws(()=>Walk.initial(walk,120,120),/No walkable local city ground/);
 }
 const registry=Tiles.createRegistry([flat(0,14)]),
  world=Walk.createWorld(registry,cacheOf(registry),new Set(registry.keys()),[]);
 const initial=Walk.initial(world,100,100),saved=Story.serialize(Story.createState());
 assert.throws(()=>Walk.step(world,initial,{east:2}),/Invalid 60Hz civilian walk input/);
 assert.throws(()=>Walk.step(world,{...initial,tick:-1},{east:1}),/Invalid temporary civilian walk state/);
 assert.equal(initial.tick,0);
 assert.equal(Story.serialize(Story.restore(saved)),saved);
});
