'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Tiles=require('../src/aden-citywide-tiles.js');
const Explorer=require('../src/aden-city-explorer.js');
const SRC=Explorer.SOURCE;
const planar=(tx,tz,gridSize=33)=>Tiles.createHeightTile({tx,tz,gridSize,source:SRC,
 samples:Array.from({length:gridSize*gridSize},(_,i)=>{
  const x=tx*512+(i%gridSize)*512/(gridSize-1),
        z=tz*512+Math.floor(i/gridSize)*512/(gridSize-1);
  return 22+.15*x+.075*z;
 })});
function approx(a,b,tol=1e-8){assert.ok(Math.abs(a-b)<tol,`expected ${a} close to ${b}`);}
test('real world-metre surface slope follows the exact rendered triangle at all supported LOD steps',()=>{
 const tile=planar(-1,1);
 for(const stride of [1,2,4,8,16,32]){
  const mesh=Tiles.buildTerrainMesh(tile,stride);
  const x=-251.7,z=756.2,
    s=Tiles.terrainSurface(mesh,x,z);
  approx(s.elevationMetres,22+.15*x+.075*z,1e-7);
  approx(s.slopeDegrees,Math.atan(Math.hypot(.15,.075))*180/Math.PI,1e-8);
  approx(Math.hypot(s.normal.x,s.normal.y,s.normal.z),1);
  assert.ok(s.normal.y>0);
  assert.equal(s.meshKey,'aden:-1:1');
  assert.equal(s.lodStep,stride);
  assert.ok(Object.isFrozen(s)&&Object.isFrozen(s.normal));
 }
});
test('terrain has no invented slope on unknown tiles and rejects off-mesh sampling',()=>{
 const m=Tiles.buildTerrainMesh(planar(0,0),2);
 assert.throws(()=>Tiles.terrainSurface(m,-.01,0),/outside loaded terrain mesh/);
 assert.throws(()=>Tiles.terrainSurface(m,1e10,0),/world-metre/);
 const flat=Tiles.createHeightTile({tx:0,tz:0,source:SRC,gridSize:17,
 samples:Array(17*17).fill(38)});
 const s=Tiles.terrainSurface(Tiles.buildTerrainMesh(flat,2),120,244);
 approx(s.slopeDegrees,0);
 approx(s.elevationMetres,38);
});
