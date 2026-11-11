'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Tiles=require('../src/aden-citywide-tiles.js');
const Explorer=require('../src/aden-city-explorer.js');
const SOURCE=Explorer.SOURCE;
function raw(tx,tz=0,shift=0,size=17){
 const gap=512/(size-1);
 return {tx,tz,gridSize:size,source:SOURCE,
  samples:Array.from({length:size*size},(_,i)=>{
   const x=tx*512+(i%size)*gap,z=tz*512+Math.floor(i/size)*gap;
   return 14+.015*x+.006*z+shift;
  })
 };
}
const doc=tiles=>({format:'veilpoint-heightfield-v1',
 coordinateSystem:'local-metre-unreferenced',
 title:'Original test public terrain, non-georeferenced',tiles});
const read=tiles=>Tiles.importHeightDataset(doc(tiles)).registry;
test('separate 512m tile files extend the same original local-world map without losing earlier source identities',()=>{
 const first=read([raw(0)]),second=read([raw(1)]),third=read([raw(2)]);
 const initialTile=first.get('aden:0:0');
 const m1=Tiles.mergeHeightRegistries(first,second);
 assert.equal(first.size,1,'the original registry is immutable by policy');
 assert.equal(m1.registry.size,2);
 assert.strictEqual(m1.registry.get('aden:0:0'),initialTile);
 assert.strictEqual(m1.registry.get('aden:1:0'),second.get('aden:1:0'));
 assert.deepEqual([m1.tilesAdded,m1.tilesTotal,m1.seams],[1,2,1]);
 assert.equal(m1.localOnly,true);
 assert.equal(m1.geographicAccuracyVerified,false);
 assert.ok(Object.isFrozen(m1));
 const m2=Tiles.mergeHeightRegistries(m1.registry,third);
 assert.equal(m2.tilesTotal,3);
 assert.equal(m2.seams,2);
 assert.equal(Tiles.auditRegistrySeams(m2.registry).pass,true);
 assert.deepEqual([...m2.registry.keys()],['aden:0:0','aden:1:0','aden:2:0']);
 for(const stride of [1,2,4]){
  const left=Tiles.buildTerrainMesh(m2.registry.get('aden:0:0'),stride);
  const right=Tiles.buildTerrainMesh(m2.registry.get('aden:1:0'),stride);
  const n=Math.sqrt(left.vertexCount);
  for(let row=0;row<n;row++){
   const a=left.positions.slice((row*n+n-1)*3,(row*n+n)*3);
   const b=right.positions.slice(row*n*3,row*n*3+3);
   assert.deepEqual(a,b,'LOD meshes have continuous physical seam heights');
  }
 }
});
test('malformed, duplicate, unlicensed or mismatched additions cannot mutate the old world',()=>{
 const first=read([raw(0)]),before=first.get('aden:0:0');
 for(const candidate of [
  read([raw(0)]),
  read([raw(1,0,1.2)])
 ]){
  assert.throws(()=>Tiles.mergeHeightRegistries(first,candidate),
   /Duplicate imported terrain tile|boundary mismatch/);
  assert.deepEqual([...first.keys()],['aden:0:0']);
  assert.strictEqual(first.get('aden:0:0'),before);
 }
 const mixed=Tiles.mergeHeightRegistries(first,read([raw(1,0,0,33)]));
 assert.equal(mixed.tilesTotal,2,'a genuinely matching sampled edge can load at mixed LOD');
 assert.ok(mixed.seamMaxGapMetres<1e-7);
 assert.strictEqual(first.get('aden:0:0'),before,
  'the original source tile survives without interpolation or replacement');
 assert.throws(()=>read([{...raw(1),source:{...SOURCE,license:''}}]),
  /Unverified geographic source/);
 assert.throws(()=>Tiles.mergeHeightRegistries(first,new Map()),/validated terrain registries/);
 assert.throws(()=>Tiles.mergeHeightRegistries(first,new Map([['aden:9:0',before]])),
  /Invalid incoming tile registry key/);
 assert.throws(()=>Tiles.mergeHeightRegistries(first,read([raw(1)]),2),
  /Invalid registry seam audit/);
 assert.equal(first.size,1);
});
test('many valid batches cumulatively extend a larger local window beyond 49 tiles without invented real-city coverage',()=>{
 const left=read(Array.from({length:49},(_,i)=>raw(i,0)));
 const right=read(Array.from({length:49},(_,i)=>raw(i+49,0)));
 const all=Tiles.mergeHeightRegistries(left,right);
 assert.equal(left.size,49);
 assert.equal(right.size,49);
 assert.equal(all.tilesTotal,98);
 assert.equal(all.seams,97);
 assert.ok(all.seamMaxGapMetres<1e-7);
 const view=Tiles.planStreaming(50*512+12,120,all.registry,[],{radius:2,maxLoaded:9});
 assert.equal(view.completeCity,false);
 assert.equal(view.active.length,5,'only the five sourced tiles on this one-row map are resident');
 assert.equal(view.streamedWorldMetresPerUnit,1);
 assert.equal(all.registry.get('aden:97:0').quality,'blockout');
 assert.equal(all.geographicAccuracyVerified,false);
});
