'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Tiles=require('../src/aden-citywide-tiles.js');
const Sim=require('../src/simulation.js'),Story=require('../src/story-slice.js');
const native=fs.readFileSync(path.resolve(__dirname,
 '../Unreal/Veilpoint/Source/Veilpoint/VPCityTileGrid.h'),'utf8');
const makeSource=(type='artist-blockout')=>({
 provider:type==='artist-blockout'?'VEILPOINT original geography test':'Verified public DEM provider',
 observedDate:'2015-06-01',license:type==='artist-blockout'?'Original proprietary art':'Licensed public-data conditions',
 reference:'local-fixture://synthetic-tile—not-real-Aden',scope:'public-terrain',type
});
function syntheticTile(tx,tz,grade='artist-blockout',offset=0){
 const size=17;
 return Tiles.createHeightTile({tx,tz,gridSize:size,
  source:makeSource(grade),
  samples:Array.from({length:size*size},(_,i)=>{
   const row=Math.floor(i/size),col=i%size;
   return 25+0.012*(tx*512+col*32)+0.022*(tz*512+row*32)+offset;
  })});
}
test('scale change is explicit 1 world unit=1 metre / 100 UE centimetres, never 1/3',()=>{
 assert.equal(Tiles.METRES_PER_UNIT,1);
 assert.equal(Tiles.TILE_METRES,512);
 assert.equal(Tiles.UE_CENTIMETRES,51200);
 assert.match(native,/EdgeMetres = 512/);
 assert.match(native,/EdgeCentimetres = 51200\.f/);
 assert.match(native,/MetresPerWorldUnit = 1\.f/);
 assert.match(native,/UnrealCentimetresPerMetre = 100\.f/);
 const one=Tiles.tileFor(-.01,-512.01);
 assert.deepEqual(one,{tx:-1,tz:-2,key:'aden:-1:-2'});
 assert.deepEqual(Tiles.tileFor(512,0),{tx:1,tz:0,key:'aden:1:0'});
 assert.deepEqual(Tiles.tileFor(511.999,0),{tx:0,tz:0,key:'aden:0:0'});
 assert.deepEqual(Tiles.tileBounds(-1,-2),
  {key:'aden:-1:-2',minX:-512,maxX:0,minZ:-1024,maxZ:-512,unit:'metres',metresPerWorldUnit:1});
 assert.deepEqual(Tiles.parseTileKey('aden:-1:-2'),{tx:-1,tz:-2});
 for(const bad of ['aden:-01:1','aden:0:-0','aden:0:1:4','aden:x:1','aden:5000:0'])
  assert.throws(()=>Tiles.parseTileKey(bad),/tile/);
 assert.throws(()=>Tiles.tileFor(Infinity,0),/world-metre/);
 assert.throws(()=>Tiles.tileFor(1e9,0),/world-metre/);
});
test('all regional civilian district names are scope labels, not invented surveyed GPS pins',()=>{
 const expected=['crater','tawahi','mualla','khormaksar',
  'sheikh-othman','mansoura','dar-saad','buraiqa'];
 assert.deepEqual(Tiles.DISTRICTS.map(d=>d.id),expected);
 for(const d of Tiles.DISTRICTS){
  assert.ok(Object.isFrozen(d));
  assert.deepEqual(Object.keys(d).sort(),['character','id','label']);
 }
 assert.equal(Tiles.DISTRICTS.some(d=>Object.hasOwn(d,'lat')||Object.hasOwn(d,'lon')),false);
});
test('only attributed ordinary public terrain is admitted; no unsupported exact site data',()=>{
 const source=makeSource();
 assert.ok(Object.isFrozen(Tiles.validateSource(source)));
 for(const patch of [
  {license:''},{observedDate:'2026-02-30'},
  {scope:'current-operational-facilities'},{scope:'restricted-site'},
  {type:'unlicensed-satellite-image'},{provider:''},{reference:''}
 ])assert.throws(()=>Tiles.validateSource({...source,...patch}),/source/);
 assert.throws(()=>Tiles.createHeightTile({
  tx:0,tz:0,gridSize:17,samples:Array(289).fill(1),
  source:{...source,scope:'civilian-architecture'}}),/public-terrain/);
 assert.throws(()=>Tiles.createHeightTile({
  tx:0,tz:0,gridSize:17,samples:Array(288).fill(1),source}),/height grid/);
 assert.throws(()=>Tiles.createHeightTile({
  tx:0,tz:0,gridSize:17,samples:Array(289).fill(NaN),source}),/height grid/);
});
test('real 1:1 local-metre interpolation is exact at corners and center of synthetic slope',()=>{
 const tile=syntheticTile(-1,2,'licensed-dem');
 assert.equal(tile.quality,'dataset-derived');
 assert.equal(tile.sampleIntervalMetres,32);
 const at=(x,z)=>25+.012*x+.022*z;
 for(const [x,z] of [
  [-512,1024],[-256,1280],[-.001,1535.999],
  [0,1536],[-333.33,1397.8]
 ])assert.ok(Math.abs(Tiles.heightAt(tile,x,z)-at(x,z))<1e-7);
 assert.throws(()=>Tiles.heightAt(tile,1,1250),/outside loaded tile/);
 assert.ok(Object.isFrozen(tile)&&Object.isFrozen(tile.samples));
 assert.throws(()=>tile.samples.push(4),TypeError);
 const original=syntheticTile(0,0);
 assert.equal(original.quality,'blockout',
  'artist-supplied test terrain must never be called surveyed/sourced 1:1 city');
});
test('seam tests catch both east-west and north-south cracks before an imported tile can stream',()=>{
 const main=syntheticTile(0,0),east=syntheticTile(1,0),
  south=syntheticTile(0,1),west=syntheticTile(-1,0);
 for(const neighbor of [east,south,west]){
  const audit=Tiles.auditSeam(main,neighbor);
  assert.equal(audit.pass,true);
  assert.equal(audit.samplesChecked,17);
  assert.ok(audit.maxGapMetres<1e-7);
 }
 const broken=syntheticTile(1,0,'artist-blockout',1.1);
 assert.deepEqual(Tiles.auditSeam(main,broken).pass,false);
 assert.ok(Tiles.auditSeam(main,broken).maxGapMetres>1);
 assert.throws(()=>Tiles.auditSeam(main,syntheticTile(2,0)),/cardinal neighbors/);
});
test('public DEM tiles generate actual full-scale mesh triangles and seam-matching LODs',()=>{
 const a=syntheticTile(-1,0),b=syntheticTile(0,0);
 const detailed=Tiles.buildTerrainMesh(a,1),medium=Tiles.buildTerrainMesh(a,2),
  far=Tiles.buildTerrainMesh(a,4);
 assert.deepEqual([detailed.vertexCount,medium.vertexCount,far.vertexCount],[289,81,25]);
 assert.deepEqual([detailed.triangleCount,medium.triangleCount,far.triangleCount],[512,128,32]);
 for(const m of [detailed,medium,far]){
  assert.equal(m.metresPerWorldUnit,1);
  assert.deepEqual(m.positions.slice(0,3),[-512,a.samples[0],0]);
  assert.deepEqual(m.positions.slice(-3),[0,a.samples.at(-1),512]);
  assert.equal(m.triangles.length,m.triangleCount*3);
  assert.ok(Object.isFrozen(m)&&Object.isFrozen(m.positions)&&Object.isFrozen(m.triangles));
 }
 for(const step of [1,2,4]){
  const left=Tiles.buildTerrainMesh(a,step),right=Tiles.buildTerrainMesh(b,step);
  const n=(16/step)+1;
  for(let row=0;row<n;row++){
   const westLast=left.positions.slice((row*n+n-1)*3,(row*n+n)*3);
   const eastFirst=right.positions.slice((row*n)*3,(row*n+1)*3);
   assert.deepEqual(westLast,eastFirst,
    'two adjacent terrain meshes have no physical LOD boundary height gap');
  }
 }
 assert.throws(()=>Tiles.buildTerrainMesh(a,3),/LOD/);
 assert.throws(()=>Tiles.buildTerrainMesh(a,32),/LOD/);
});
test('deterministic streaming never loads unprovided city data or silently asserts complete city',()=>{
 const registry=Tiles.createRegistry(Array.from({length:25},(_,i)=>
  syntheticTile(i%5-2,Math.floor(i/5)-2)));
 assert.equal(registry.size,25);
 const old=['aden:0:0','aden:3:3','aden:-2:-2'];
 const plan=Tiles.planStreaming(3,-3,registry,old,{radius:2,maxLoaded:9});
 assert.equal(plan.origin,'aden:0:-1');
 assert.equal(plan.active.length,9);
 assert.ok(plan.active.includes('aden:0:-1'));
 assert.ok(plan.load.every(k=>registry.has(k)&&!old.includes(k)));
 assert.ok(plan.keep.every(k=>old.includes(k)));
 assert.ok(plan.unload.includes('aden:3:3'));
 assert.equal(plan.completeCity,false);
 assert.ok(plan.unresolved.length>0,'unimported city coverage stays visibly missing');
 assert.equal(plan.unresolved.includes('aden:0:-1'),false,
  'the exact user location was included in the supplied public tile registry');
 assert.equal(plan.streamedWorldMetresPerUnit,1);
 assert.deepEqual(Tiles.planStreaming(3,-3,registry,old,{radius:2,maxLoaded:9}),plan);
 assert.ok(Object.isFrozen(plan.active));
 assert.deepEqual(Tiles.planStreaming(0,0,Tiles.createRegistry([])).active,[]);
 assert.throws(()=>Tiles.createRegistry([syntheticTile(0,0),syntheticTile(0,0)]),/Duplicate/);
 assert.throws(()=>Tiles.planStreaming(0,0,registry,[],{maxLoaded:1000}),/budget/);
});
test('current 350m proof-of-play and CH01 v2 saves stay intact; city registry is not yet a finished playable Aden',()=>{
 const sim=Sim.newMatch(1985,0),story=Story.createState();
 const before=sim.obstacles.map(o=>({...o}));
 const planner=Tiles.planStreaming(0,0,Tiles.createRegistry([syntheticTile(0,0)]));
 assert.deepEqual(planner.active,['aden:0:0']);
 assert.deepEqual(sim.obstacles,before);
 assert.equal(sim.terrainRevision,1);
 assert.equal(Story.serialize(Story.restore(Story.serialize(story))),Story.serialize(story));
 assert.equal(sim.obstacles.some(o=>o.type==='aden-full-city-placeholder'),false);
 const source=fs.readFileSync(path.resolve(__dirname,'../src/aden-citywide-tiles.js'),'utf8');
 const sandbox=vm.createContext({});
 vm.runInContext(source,sandbox);
 assert.equal(sandbox.VeilpointAdenCityTiles.TILE_METRES,512);
});
