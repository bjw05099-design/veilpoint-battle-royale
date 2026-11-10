'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Tiles=require('../src/aden-citywide-tiles.js');
const Walk=require('../src/aden-city-walking-probe.js');

const source={provider:'VEILPOINT synthetic civilian walking regression',
 observedDate:'2026-11-11',license:'Original non-georeferenced artist terrain',
 reference:'local synthetic ground data, never a surveyed Aden DEM',
 scope:'public-terrain',type:'artist-blockout'};
function ground(elevation,enabled=true){
 const tile=Tiles.createHeightTile({tx:0,tz:0,gridSize:17,source,
  samples:Array(17*17).fill(elevation)});
 const registry=Tiles.createRegistry([tile]),cache=new Map([
  ['aden:0:0',{sourceTile:tile,lod:1,mesh:Tiles.buildTerrainMesh(tile,1)}]
 ]);
 return Walk.createWorld(registry,cache,enabled?new Set(['aden:0:0']):new Set(),[]);
}

test('60Hz fictional pedestrian cannot cross after their supporting terrain tile is unloaded',()=>{
 const prior=ground(20),current=ground(20,false);
 const from=Walk.initial(prior,128,128),next=Walk.step(current,from,{east:1});
 assert.equal(next.tick,from.tick+1,'simulation time is still deterministic');
 assert.equal(next.x,from.x);
 assert.equal(next.z,from.z);
 assert.equal(next.y,from.y);
 assert.equal(next.blocked,true,'unknown terrain is not silently walkable');
 assert.equal(Walk.probe(current,128,128),null);
});
test('a changed terrain height cannot smuggle a walker vertically through a new cliff',()=>{
 const original=ground(20),raised=ground(22);
 const from=Walk.initial(original,128,128);
 const out=Walk.step(raised,from,{east:1});
 assert.equal(out.blocked,true);
 assert.deepEqual({x:out.x,z:out.z,y:out.y},
  {x:from.x,z:from.z,y:from.y});
 assert.equal(out.tick,1);
 // Starting fresh on the new confirmed ground remains possible.
 const fresh=Walk.initial(raised,128,128);
 assert.equal(fresh.y,22);
 assert.ok(Walk.step(raised,fresh,{east:1}).x>fresh.x);
});
test('small LOD height corrections ground feet without extra movement or new save version',()=>{
 const before=ground(20),resampled=ground(20.12);
 const from=Walk.initial(before,128,128);
 const step=Walk.step(resampled,from,{east:1});
 assert.equal(step.version,1);
 assert.equal(step.blocked,false);
 assert.ok(step.x>128&&step.x<=128+Walk.SPEED_METRES_PER_SECOND/60+1e-8);
 assert.ok(Math.abs(step.y-20.12)<1e-8);
 assert.equal(step.z,128);
});
