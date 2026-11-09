'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Tiles=require('../src/aden-citywide-tiles.js');
const UE=require('../scripts/export-ue5-heightmaps.cjs');
const source=Object.freeze({provider:'Original VEILPOINT terrain artist',
 observedDate:'2026-11-10',license:'Original art under artist control',
 reference:'analytic synthetic height continuity fixture',
 scope:'public-terrain',type:'artist-blockout'});
function tile(tx,tz,offset=0,n=17){
 return {tx,tz,gridSize:n,source,
  samples:Array.from({length:n*n},(_,i)=>{
   const x=tx*512+(i%n)*512/(n-1),
    z=tz*512+Math.floor(i/n)*512/(n-1);
   return 80+.012*x+.017*z+offset;
  })};
}
const doc=tiles=>({format:'veilpoint-heightfield-v1',
 coordinateSystem:'local-metre-unreferenced',
 title:'Local fictional DEM assembly',tiles});
test('Epic recommended 505x505 R16 export preserves exact 512m tile extent and vertical transform',()=>{
 const conversion=UE.convertHeightDocument(doc([tile(0,0),tile(1,0)]));
 assert.equal(conversion.files.length,2);
 const {manifest}=conversion;
 assert.equal(manifest.heightmapWidth,505);
 assert.equal(manifest.heightmapHeight,505);
 assert.equal(manifest.componentLayout,'4x4 components, 63 quads per section, 2x2 sections');
 assert.equal(manifest.pixelFormat,'unsigned-16-bit-little-endian');
 assert.equal(manifest.xyScaleCm,512*100/504);
 assert.equal(manifest.landscapeZScaleCm,3600*100/512);
 assert.equal(manifest.recommendedLandscapeActorZCm,125000);
 assert.equal(manifest.quantizationMetresPerStep,3600/65536);
 assert.equal(manifest.encodedSeamsChecked,1);
 assert.equal(manifest.ue5EngineBuilt,false);
 assert.equal(manifest.licenseReviewed,false);
 assert.equal(manifest.actualAdenCoverageVerified,false);
 assert.equal(manifest.georeferenced,false);
 assert.equal(manifest.surveyAccuracyVerified,false);
 const [a,b]=conversion.files;
 assert.equal(a.buffer.length,505*505*2);
 assert.equal(b.buffer.length,505*505*2);
 assert.equal(manifest.layers[1].worldOriginCm[0],51200);
 assert.equal(manifest.layers[1].worldOriginCm[1],0);
 for(let y=0;y<505;y++){
  const last=a.buffer.readUInt16LE((y*505+504)*2),
   first=b.buffer.readUInt16LE(y*505*2);
  assert.equal(last,first,'R16 border must match exactly, not just within float tolerance');
 }
 // The exporter does NOT claim that interpolating 17x17 samples at 505x505
 // recovered physically observed meter-scale terrain structure.
 assert.match(manifest.resampling,/does not create real-world elevation detail/);
});
test('16-bit height quantization is deterministic, centered and bounded',()=>{
 const s=UE.verticalEncoding();
 assert.equal(UE.encodeHeight(s.midpointMetres,s),32768);
 assert.equal(UE.encodeHeight(s.midpointMetres+s.metresPerCode*128,s),32896);
 assert.throws(()=>UE.encodeHeight(4000,s),/vertical range/);
 assert.throws(()=>UE.verticalEncoding({minMetres:100,maxMetres:10}),/vertical extent/);
 assert.throws(()=>UE.verticalEncoding({minMetres:-10000,maxMetres:10000}),/vertical extent/);
 const a=UE.convertHeightDocument(doc([tile(-1,2)]));
 const b=UE.convertHeightDocument(doc([tile(-1,2)]));
 assert.deepEqual(a.files[0].buffer,b.files[0].buffer);
 assert.deepEqual(a.manifest,b.manifest);
});
test('even an accepted 14cm source seam is rejected when UE raster would expose a crack',()=>{
 const accepted=Tiles.importHeightDataset(doc([tile(0,0),tile(1,0,.14)]));
 assert.equal(accepted.tilesImported,2);
 assert.ok(accepted.seams===1);
 assert.throws(()=>UE.convertHeightDocument(doc([tile(0,0),tile(1,0,.14)])),
  /visible crack/);
 assert.throws(()=>UE.convertHeightDocument(doc([tile(0,0),tile(1,0,.5)])),
  /boundary mismatch/);
});
test('no real Aden coordinate or restricted site geometry can be embedded in the UE export input',()=>{
 assert.throws(()=>UE.convertHeightDocument({
  ...doc([tile(0,0)]),latitude:12.7}),/Invalid offline heightfield document/);
 assert.throws(()=>UE.convertHeightDocument(doc([
  {...tile(0,0),sitePerimeter:'hidden'}])),/Invalid elevation-only tile record/);
 assert.equal(UE.RESOLUTION,505);
 const allowed=UE.convertHeightDocument(doc([tile(0,0)]));
 assert.deepEqual(allowed.manifest.layers[0].worldOriginCm,[0,0]);
 assert.match(allowed.manifest.layers[0].filename,/^aden_x0_z0_505\.r16$/);
});
