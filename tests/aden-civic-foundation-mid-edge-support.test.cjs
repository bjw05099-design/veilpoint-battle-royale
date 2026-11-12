'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Tiles=require('../src/aden-citywide-tiles.js');
const City=require('../src/aden-city-explorer.js');
const Districts=require('../src/aden-preview-districts.js');
const site={x:128,z:128,w:16,d:16};
function fixture(change=()=>20){
 const n=65,step=512/(n-1);
 const tile=Tiles.createHeightTile({tx:0,tz:0,gridSize:n,source:City.SOURCE,
  samples:Array.from({length:n*n},(_,i)=>
   change((i%n)*step,Math.floor(i/n)*step))});
 const registry=Tiles.createRegistry([tile]);
 const cache=new Map([[tile.key,{sourceTile:tile,lod:1,mesh:Tiles.buildTerrainMesh(tile,1)}]]);
 return {registry,cache,visible:new Set([tile.key])};
}
test('supported original neighborhood house still rests on the EXACT painted triangle and remains drawable',()=>{
 const f=fixture();
 const foundation=Districts.buildingFoundation(site,f.registry,f.cache,f.visible);
 assert.ok(foundation);
 assert.equal(foundation.baseMetres,20);
 assert.equal(foundation.plinthMetres,0);
 assert.equal(foundation.actualSurveyVerified,false);
});
test('a hidden unsupported gully or sharp ridge at SIDE midpoint cannot be bridged by four good corners',()=>{
 for(const bad of [-3,31]){
  const f=fixture((x,z)=>x===128&&z===120?bad:20);
  assert.equal(Districts.buildingFoundation(site,f.registry,f.cache,f.visible),null);
 }
});
test('mid-edge terrain provenance remains mandatory, including stale mesh revisions',()=>{
 const f=fixture();
 assert.equal(Districts.buildingFoundation(site,f.registry,new Map(),f.visible),null);
 const altered=fixture();
 assert.equal(Districts.buildingFoundation(site,altered.registry,f.cache,altered.visible),null);
});
