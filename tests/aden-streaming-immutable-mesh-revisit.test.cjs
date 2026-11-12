'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Tiles=require('../src/aden-citywide-tiles.js');

const source=Object.freeze({provider:'VEILPOINT original test art',observedDate:'2026-11-12',
 license:'Original fictional art',reference:'local-original-only',scope:'public-terrain',type:'artist-blockout'});
function tile(tx,offset=0){
 return Tiles.createHeightTile({tx,tz:0,gridSize:33,source,
  samples:Array.from({length:33*33},(_,i)=>8+offset+Math.floor(i/33)*.1+(i%33)*.03)});
}

test('revisiting streamed frozen city tiles reuses exactly the earlier authored LOD mesh',()=>{
 const first=tile(0),adjacent=tile(1);
 const m1=Tiles.buildTerrainMesh(first,1),m2=Tiles.buildTerrainMesh(first,2);
 const cache=new Map([['aden:0:0',{lod:1,sourceTile:first,mesh:m1}]]);
 const elevations=[Tiles.heightOnTerrainMesh(m1,80,160),Tiles.heightOnTerrainMesh(m2,80,160)];
 cache.clear(); // player has moved far enough for the renderer to evict its local tile
 assert.strictEqual(Tiles.buildTerrainMesh(first,1),m1);
 assert.strictEqual(Tiles.buildTerrainMesh(first,2),m2);
 assert.notStrictEqual(m1,m2,'distinct LODs must retain independently triangulated geometry');
 assert.deepEqual([Tiles.heightOnTerrainMesh(m1,80,160),Tiles.heightOnTerrainMesh(m2,80,160)],elevations);
 assert.ok(Object.isFrozen(m1)&&Object.isFrozen(m1.positions)&&Object.isFrozen(m1.triangles));
 assert.notStrictEqual(Tiles.buildTerrainMesh(adjacent,1),m1);
});

test('a new validated source for the same local tile key never borrows the previous cached mesh',()=>{
 const old=tile(0),replacement=tile(0,4.5);
 const meshA=Tiles.buildTerrainMesh(old,1),meshB=Tiles.buildTerrainMesh(replacement,1);
 assert.notStrictEqual(meshA,meshB);
 assert.deepEqual(meshA.positions.slice(0,3),[0,8,0]);
 assert.deepEqual(meshB.positions.slice(0,3),[0,12.5,0]);
 assert.strictEqual(Tiles.buildTerrainMesh(replacement,1),meshB);
 assert.equal(meshB.triangleCount,meshA.triangleCount);
});

test('mutable temporary terrain fixtures cannot hide changed elevations behind the mesh cache',()=>{
 const raw={tx:0,tz:0,key:'aden:0:0',gridSize:17,samples:Array(289).fill(6)};
 const a=Tiles.buildTerrainMesh(raw),b=Tiles.buildTerrainMesh(raw);
 assert.notStrictEqual(a,b,'mutable source identity is not immutable terrain provenance');
 raw.samples[0]=9;
 const newMesh=Tiles.buildTerrainMesh(raw);
 assert.equal(a.positions[1],6);
 assert.equal(newMesh.positions[1],9);
 assert.throws(()=>Tiles.buildTerrainMesh(tile(1),3),/LOD/);
});
