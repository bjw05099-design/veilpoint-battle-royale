'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Tiles=require('../src/aden-citywide-tiles.js');
const Explorer=require('../src/aden-city-explorer.js');
const Districts=require('../src/aden-preview-districts.js');
const Walk=require('../src/aden-city-walking-probe.js');
const Story=require('../src/story-slice.js');
function setup(){
 const registry=Explorer.createPreviewRegistry(),cache=new Map();
 const ctx={fillRect(){},strokeRect(){},beginPath(){},moveTo(){},
  lineTo(){},closePath(){},fill(){},stroke(){}};
 Explorer.draw({width:1280,height:720,getContext:()=>ctx},
  registry,Explorer.viewState(),cache);
 const buildings=[...Explorer.CIVIC_SHELLS,...Districts.PLAN.buildings];
 const make=closed=>Walk.createWorld(registry,cache,new Set(cache.keys()),buildings,closed);
 return {registry,cache,buildings,make};
}
test('local spatial broadphase exactly matches legacy exhaustive circle/AABB collision on the same real streamed mesh',()=>{
 const {make}=setup(),world=make(),reference={...world};
 assert.equal(world.broadphase.cellMetres,32);
 assert.ok(world.broadphase.occupiedCells>40);
 assert.equal(world.broadphase.indexedColliders,world.solids.length);
 assert.equal(world.broadphase.largeColliders,0);
 assert.ok(Object.isFrozen(world.broadphase));
 let checked=0;
 for(let x=-840;x<860;x+=31)for(let z=-790;z<990;z+=29){
  const actual=Walk.probe(world,x,z),expected=Walk.probe(reference,x,z);
  assert.equal(!!actual,!!expected,'collision must be identical at '+x+','+z);
  if(actual){
   assert.ok(Math.abs(actual.y-expected.y)<1e-9);
   checked++;
  }
 }
 assert.ok(checked>400,'the audit covered real walkable terrain');
});
test('closed doors add one physical wall slab for every actual original public room, blocking continuous 60Hz entry',()=>{
 const {make}=setup(),opened=make(),ids=new Set(Districts.PUBLIC_INTERIORS.map(x=>x.id)),
  closed=make(ids);
 assert.equal(ids.size,8);
 assert.equal(opened.rooms.length,8);
 assert.equal(closed.solids.length,opened.solids.length+8);
 assert.equal(closed.broadphase.indexedColliders,closed.solids.length);
 for(const room of opened.rooms){
  assert.ok(closed.solids.some(s=>s.id===room.id+':door'));
  assert.ok(!opened.solids.some(s=>s.id===room.id+':door'));
  let a=Walk.initial(opened,room.x,room.z+room.d/2+1.8),
      b=Walk.initial(closed,room.x,room.z+room.d/2+1.8);
  for(let i=0;i<340;i++){
   const p=a;
   a=Walk.step(opened,a,{south:-1});
   b=Walk.step(closed,b,{south:-1});
   assert.ok(Math.hypot(a.x-p.x,a.z-p.z)<=1.7/60+1e-9);
  }
  assert.equal(Districts.publicRoomAt(a.x,a.z)?.id,room.id);
  assert.equal(Districts.publicRoomAt(b.x,b.z),null);
  assert.ok(b.z>=room.z+room.d/2+Walk.RADIUS_METRES-.02);
  assert.equal(b.blocked,true);
  assert.ok(Walk.probe(opened,room.x,room.z+room.d/2-.17));
  assert.equal(Walk.probe(closed,room.x,room.z+room.d/2-.17),null);
 }
 const current=Story.serialize(Story.createState());
 assert.equal(Story.serialize(Story.restore(current)),current);
 assert.equal(closed.storyCollisionConnected,false);
 assert.equal(closed.brCollisionConnected,false);
});
test('the broadphase preserves outsize original solids instead of dropping them at a maximum bucket span',()=>{
 const samples=Array(17*17).fill(28),tiles=[];
 for(let tx=-2;tx<=1;tx++)for(let tz=-2;tz<=1;tz++)
  tiles.push(Tiles.createHeightTile({tx,tz,gridSize:17,source:Explorer.SOURCE,samples}));
 const registry=Tiles.createRegistry(tiles);
 const cache=new Map([...registry].map(([key,sourceTile])=>[key,{
  sourceTile,lod:2,mesh:Tiles.buildTerrainMesh(sourceTile,2)
 }]));
 const world=Walk.createWorld(registry,cache,new Set(registry.keys()),
  [{id:'original-large-municipal-shell',x:0,z:0,w:1100,d:1100}]);
 assert.equal(world.solids.length,1);
 assert.equal(world.broadphase.largeColliders,1);
 assert.equal(world.broadphase.indexedColliders,0);
 assert.equal(Walk.probe(world,0,0),null);
 assert.ok(Walk.probe(world,700,700));
});
