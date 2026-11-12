'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Tiles=require('../src/aden-citywide-tiles.js');
const Streets=require('../src/aden-preview-streets.js');
const Explorer=require('../src/aden-city-explorer.js');
const route={id:'original-civic-lane-sample',width:6,
 points:[{x:80,z:90},{x:110,z:90}]};
function surface(fn){
 const n=17,step=512/(n-1),tile=Tiles.createHeightTile({
  tx:0,tz:0,gridSize:n,source:Explorer.SOURCE,
  samples:Array.from({length:n*n},(_,i)=>{
   const x=(i%n)*step,z=Math.floor(i/n)*step;return fn(x,z);
  })});
 const registry=Tiles.createRegistry([tile]);
 const cache=new Map([[tile.key,{sourceTile:tile,lod:1,mesh:Tiles.buildTerrainMesh(tile)}]]);
 return {registry,cache,active:new Set([tile.key])};
}
test('original civilian public pavement appears on supported gentle 1:1 metre local mesh',()=>{
 const f=surface((x,z)=>12+.03*x+.015*z);
 const triangles=Streets.triangulate(f.registry,f.cache,f.active,[route]);
 assert.ok(triangles.length>=6);
 assert.equal(triangles.length%2,0);
 assert.ok(triangles.every(t=>t.roadId===route.id&&t.vertices.every(v=>v[1]>0)));
 assert.equal(Streets.MAX_ROAD_SLOPE_DEGREES,20);
 assert.equal(Streets.hasGameCollision,false);
});
test('steep cliff or underwater city terrain cannot be painted as a safe road',()=>{
 for(const terrain of [(x)=>25+.8*x,()=>-3]){
  const f=surface(terrain);
  assert.equal(Streets.triangulate(f.registry,f.cache,f.active,[route]).length,0);
 }
});
test('missing and stale terrain mesh revisions cannot draw a road across unverified surface',()=>{
 const f=surface(()=>25);
 assert.ok(Streets.triangulate(f.registry,f.cache,f.active,[route]).length>0);
 assert.equal(Streets.triangulate(f.registry,new Map(),f.active,[route]).length,0);
 const newer=surface(()=>25);
 assert.equal(Streets.triangulate(newer.registry,f.cache,newer.active,[route]).length,0);
});
