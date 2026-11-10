'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Tiles=require('../src/aden-citywide-tiles.js');
const Explorer=require('../src/aden-city-explorer.js');
const source={
 provider:'VEILPOINT original local terrain test',
 observedDate:'2026-11-10',license:'Original non-georeferenced fictional sample',
 reference:'local triangle surface fixture',scope:'public-terrain',type:'artist-blockout'
};
function tile(tx=0,tz=0,n=17,height=(x,z)=>0){
 return Tiles.createHeightTile({tx,tz,gridSize:n,source,samples:
  Array.from({length:n*n},(_,i)=>height(tx*512+(i%n)*512/(n-1),
    tz*512+Math.floor(i/n)*512/(n-1)))});
}
function canvas(){
 const c={fillRect(){},beginPath(){},moveTo(){},lineTo(){},closePath(){},
  fill(){},stroke(){},strokeRect(){},lineWidth:1};
 return {width:960,height:600,getContext(){return c;}};
}
const approx=(a,b)=>assert.ok(Math.abs(a-b)<1e-8, a+' !== '+b);

test('single nonplanar source quad: displayed mesh triangle is NOT bilinear centre height',()=>{
 const n=17,raw=Array(n*n).fill(0);raw[n+1]=8;
 const t=Tiles.createHeightTile({tx:0,tz:0,gridSize:n,samples:raw,source});
 const mesh=Tiles.buildTerrainMesh(t,1);
 approx(Tiles.heightAt(t,8,8),.5);
 approx(Tiles.heightOnTerrainMesh(mesh,8,8),0);
 approx(Tiles.heightAt(t,24,24),4.5);
 approx(Tiles.heightOnTerrainMesh(mesh,24,24),4);
 // The shared diagonal between triangles has a unique continuous height.
 approx(Tiles.heightOnTerrainMesh(mesh,16,16),0);
});

test('world-metre triangle surface follows EXACT 512m mesh LOD and negative tile origins',()=>{
 for(const stride of [1,2,4,8,16]){
  const t=tile(-2,3,17,(x,z)=>25+.02*x-.014*z);
  const mesh=Tiles.buildTerrainMesh(t,stride);
  for(const [x,z] of [[-1024,1536],[-1001.7,1544.2],[-768,1792],[-512,2048]])
   approx(Tiles.heightOnTerrainMesh(mesh,x,z),25+.02*x-.014*z);
  assert.equal(mesh.lodStep,stride);
 }
});

test('two neighboring height meshes are physically continuous at shared edge at independent LOD',()=>{
 const elevation=(x,z)=>8+.017*x-.013*z;
 const a=tile(0,0,33,elevation),b=tile(1,0,33,elevation);
 for(const leftStride of [1,2,4,8,16,32])for(const rightStride of [1,2,4,8,16,32]){
  const l=Tiles.buildTerrainMesh(a,leftStride),r=Tiles.buildTerrainMesh(b,rightStride);
  for(const z of [0,13.5,114,256,410.2,512])
   approx(Tiles.heightOnTerrainMesh(l,512,z),Tiles.heightOnTerrainMesh(r,512,z));
 }
});

test('bad coordinates or malformed meshes fail rather than fabricating a local centre altitude',()=>{
 const mesh=Tiles.buildTerrainMesh(tile(),2);
 for(const [x,z] of [[-1,0],[513,5],[0,513],[Infinity,0],[NaN,20]])
  assert.throws(()=>Tiles.heightOnTerrainMesh(mesh,x,z));
 assert.throws(()=>Tiles.heightOnTerrainMesh({},5,5),/Invalid/);
 assert.throws(()=>Tiles.heightOnTerrainMesh({...mesh,vertexCount:25},5,5),/Invalid/);
 assert.throws(()=>Tiles.heightOnTerrainMesh({...mesh,key:'aden:00:0'},5,5),/Noncanonical/);
});

test('visible terrain preview reticle samples the same actual painted LOD mesh and reports missing data honestly',()=>{
 const n=17,samples=Array(n*n).fill(0);samples[n+1]=8;
 const t=Tiles.createHeightTile({tx:0,tz:0,gridSize:n,samples,source});
 const registry=Tiles.createRegistry([t]);
 for(const [zoom,stride] of [[1.5,1],[.8,2],[.25,4]]){
  const state=Explorer.viewState({x:8,z:8,zoom});
  const cache=new Map();
  const stats=Explorer.draw(canvas(),registry,state,cache,{imported:true,showFictionalBuildings:false});
  assert.equal(stats.lodStep,stride);
  assert.equal(stats.centerElevationSurface,'painted-triangle');
  assert.equal(stats.centerElevationMetres,Math.round(
   Tiles.heightOnTerrainMesh(cache.get(t.key).mesh,8,8)*100)/100);
  assert.equal(stats.realAdenTilesLoaded,0);
  assert.equal(stats.localElevationOnly,true);
 }
 const missing=Explorer.draw(canvas(),registry,Explorer.viewState({x:1600,z:0}),new Map(),
  {imported:true,showFictionalBuildings:false});
 assert.equal(missing.centerElevationMetres,null);
});
