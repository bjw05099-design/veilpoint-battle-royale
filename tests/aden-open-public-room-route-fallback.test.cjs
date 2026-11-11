'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Tiles=require('../src/aden-citywide-tiles.js');
const Explorer=require('../src/aden-city-explorer.js');
const Walk=require('../src/aden-city-walking-probe.js');
const Routes=require('../src/aden-civilian-walk-route.js');
function scene(){
 const registry=Explorer.createPreviewRegistry(0,17);
 const cache=new Map([...registry].map(([key,tile])=>[key,{
  sourceTile:tile,lod:1,mesh:Tiles.buildTerrainMesh(tile,1)
 }]));
 const base=Walk.createWorld(registry,cache,new Set(registry.keys()),[]);
 const rooms=[94,96,98,106].map((x,i)=>({
  id:'local-room-'+i,x,z:90,d:8
 }));
 const doors=rooms.slice(0,3).map(room=>Object.freeze({
  id:room.id+':door',minX:room.x-1.5,maxX:room.x+1.5,
  minZ:room.z+3.5,maxZ:room.z+4
 }));
 const world={...base,solids:Object.freeze(doors)};
 const walker=Walk.initial(world,90,90);
 return {world,walker,rooms};
}
test('public-room wayfinding finds fourth open door when three nearer rooms are closed',()=>{
 const {world,walker,rooms}=scene();
 const result=Routes.plan(world,walker,rooms);
 assert.equal(result.status,'planned');
 assert.equal(result.roomId,rooms[3].id);
 assert.ok(result.points.length>=2);
 assert.ok(result.explored<=Routes.MAX_EXPANSIONS);
 assert.equal(result.originTick,walker.tick);
 assert.equal(result.surveyedGeography,false);
 assert.equal(result.controlsPlayer,false);
 for(let i=1;i<result.points.length;i++)
  assert.equal(Routes.segment(world,result.points[i-1],result.points[i]),true,
   'every displayed route segment remains traversable on exact loaded triangle terrain');
});
test('all shut nearby doors remain honestly unavailable without inventing a route',()=>{
 const {world,walker,rooms}=scene();
 const extra=Object.freeze({id:rooms[3].id+':door',minX:104.5,maxX:107.5,
  minZ:93.5,maxZ:94});
 const closed={...world,solids:Object.freeze([...world.solids,extra])};
 const result=Routes.plan(closed,walker,rooms);
 assert.equal(result.status,'door-closed');
 assert.equal(result.roomId,rooms[0].id);
 assert.deepEqual(result.points,[]);
 assert.equal(result.controlsPlayer,false);
});
