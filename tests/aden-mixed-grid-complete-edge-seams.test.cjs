'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Tiles=require('../src/aden-citywide-tiles.js');
const Explorer=require('../src/aden-city-explorer.js');
const source=Explorer.SOURCE;
function tile(tx,tz,n,shift=0,spike=null){
 const step=512/(n-1);
 return Tiles.createHeightTile({tx,tz,gridSize:n,source,
  samples:Array.from({length:n*n},(_,i)=>{
   const col=i%n,row=Math.floor(i/n);
   const x=tx*512+col*step,z=tz*512+row*step;
   const at=14+.013*x+.009*z;
   return at+shift+(spike===i?1.2:0);
  })});
}
const doc=raw=>({format:'veilpoint-heightfield-v1',
 coordinateSystem:'local-metre-unreferenced',
 title:'Nongeoreferenced original terrain samples',
 tiles:raw.map(({tx,tz,gridSize,samples})=>({tx,tz,gridSize,samples,
  source}))});
test('full 512m east-west and north-south seams can join 17, 33, and 65 point tiles without changing data',()=>{
 for(const [a,b] of [[17,33],[33,65],[17,65]]){
  const left=tile(0,0,a),right=tile(1,0,b),south=tile(0,1,b);
  const horizontal=Tiles.auditSeam(left,right,.15);
  const vertical=Tiles.auditSeam(left,south,.15);
  for(const audit of [horizontal,vertical]){
   assert.equal(audit.pass,true);
   assert.equal(audit.samplesChecked,Math.max(a,b),
    'all distinct breakpoints of both interpolated edges are audited');
   assert.ok(audit.maxGapMetres<1e-8);
  }
  const registry=Tiles.createRegistry([left,right,south]);
  const seams=Tiles.auditRegistrySeams(registry);
  assert.equal(seams.edgesChecked,2);
  assert.equal(seams.pass,true);
  assert.strictEqual(registry.get(left.key),left);
  const imported=Tiles.importHeightDataset(doc([left,right,south]));
  assert.equal(imported.tilesImported,3);
  assert.equal(imported.unreviewed,true);
  assert.equal(imported.accuracy,'source-declared-unverified');
  const combined=Tiles.mergeHeightRegistries(
   Tiles.createRegistry([left]),Tiles.createRegistry([right,south]));
  assert.equal(combined.tilesTotal,3);
  assert.ok(combined.seamMaxGapMetres<1e-8);
 }
});
test('a hidden mid-edge crack in high-resolution geometry is rejected even if 17-point corners agree',()=>{
 const low=tile(0,0,17);
 const n=65,spikeIndex=1*n;
 const high=tile(1,0,n,0,spikeIndex);
 // The spike lies between two 17-point edge samples: a coarse-only
 // comparison would have incorrectly accepted this 1.2m discontinuity.
 assert.equal(low.samples[16],high.samples[0]);
 const seam=Tiles.auditSeam(low,high,.15);
 assert.equal(seam.pass,false);
 assert.ok(seam.maxGapMetres>1);
 assert.equal(seam.samplesChecked,65);
 assert.throws(()=>Tiles.importHeightDataset(doc([low,high])),
  /boundary mismatch/);
 const existing=Tiles.createRegistry([low]),incoming=Tiles.createRegistry([high]);
 assert.throws(()=>Tiles.mergeHeightRegistries(existing,incoming),/boundary mismatch/);
 assert.deepEqual([...existing.keys()],['aden:0:0']);
 assert.strictEqual(existing.get('aden:0:0'),low);
});
test('reverse cardinal edges and 0.15m tolerances are identical regardless of tile insertion order',()=>{
 const a=tile(-1,-1,33),b=tile(0,-1,17),c=tile(-1,0,65);
 assert.equal(Tiles.auditSeam(a,b).pass,true);
 assert.equal(Tiles.auditSeam(b,a).pass,true);
 assert.equal(Tiles.auditSeam(a,c).pass,true);
 assert.equal(Tiles.auditSeam(c,a).pass,true);
 const all=Tiles.createRegistry([c,b,a]);
 assert.equal(Tiles.auditRegistrySeams(all).pass,true);
 const off=tile(0,-1,17,.151);
 assert.equal(Tiles.auditSeam(a,off,.15).pass,false);
 assert.equal(Tiles.auditSeam(a,off,.2).pass,true);
 assert.throws(()=>Tiles.auditSeam(a,tile(2,0,17)),/cardinal neighbors/);
});
