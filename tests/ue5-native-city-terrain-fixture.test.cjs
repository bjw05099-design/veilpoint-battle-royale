'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {makeFixture,prepare}=require('../scripts/prepare-ue5-terrain-lab.cjs');
const {verify}=require('../scripts/verify-ue5-tile-pack.cjs');
test('real nine-piece 1:1 native sample fixture has 3x3 original elevations, no real Aden claims',()=>{
 const fixture=makeFixture();
 assert.equal(fixture.tiles.length,9);
 assert.deepEqual(fixture.tiles.map(o=>[o.tx,o.tz]),[
  [-1,-1],[0,-1],[1,-1],
  [-1,0],[0,0],[1,0],
  [-1,1],[0,1],[1,1]]);
 assert.ok(fixture.tiles.every(t=>t.gridSize===33&&t.source.type==='artist-blockout'));
 assert.equal(fixture.coordinateSystem,'local-metre-unreferenced');
 assert.match(fixture.title,/synthetic/);
});
test('actually writes and verifies nine nonoverwriting 505 R16 tiles around viewer center',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'veilpoint-terrain-fixture-'));
 const target=path.join(dir,'CityTiles');
 try{
  const got=prepare(target);
  assert.equal(got.tiles,9);
  assert.equal(got.seams,12);
  assert.equal(got.ue5Compiled,false);
  assert.equal(got.ue5PIETested,false);
  assert.equal(got.realAdenCoverageVerified,false);
  assert.equal(verify(target).seams,12);
  const files=fs.readdirSync(target);
  assert.equal(files.length,10,'9 raw R16 files plus one JSON manifest');
  assert.ok(files.includes('IMPORT_MANIFEST.json'));
  const manifest=JSON.parse(fs.readFileSync(path.join(target,'IMPORT_MANIFEST.json'),'utf8'));
  assert.equal(manifest.layers.length,9);
  assert.equal(manifest.actualAdenCoverageVerified,false);
  assert.equal(manifest.ue5EngineBuilt,false);
  for(const layer of manifest.layers)
   assert.equal(fs.statSync(path.join(target,layer.filename)).size,505*505*2);
  assert.throws(()=>prepare(target),/already exists/);
  assert.equal(fs.readdirSync(target).length,10);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
