'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {verify}=require('../scripts/verify-public-civil-source.cjs');
test('public civilian input is hash-checked but never represented as surveyed or UE-ready',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'vp-public-source-'));
 try{
  const bytes=Buffer.from('original synthetic civil terrain fixture');
  fs.writeFileSync(path.join(dir,'sample.r16'),bytes);
  const r={kind:'public-civilian-elevation',license:'CC-BY-4.0',attribution:'Fixture author',
   sourceUrl:'https://example.org/public/civil',observedOn:'2020-05-01',
   retrievedOn:'2026-11-09',licenseReviewedOn:'2026-11-09',
   localFile:'sample.r16',sha256:crypto.createHash('sha256').update(bytes).digest('hex')};
  const result=verify(r,dir);
  assert.equal(result.verifiedLocalIntegrity,true);
  assert.equal(result.verifiedAdenCoverage,false);
  assert.equal(result.usableForNativeTerrain,false);
  for(const patch of [
   {license:'unknown'}, {license:'CC-BY-4.0',attribution:''},
   {sourceUrl:'http://example.org'}, {observedOn:'2026-02-30'},
   {retrievedOn:'2019-01-01'}, {restrictedSite:true},
   {operationalDetail:true},{claimsSurveyedAden:true},
   {localFile:'../sample.r16'},{sha256:'0'.repeat(64)}
  ])assert.throws(()=>verify({...r,...patch},dir));
  fs.writeFileSync(path.join(dir,'sample.r16'),'changed');
  assert.throws(()=>verify(r,dir),/hash mismatch/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('all 1:1 public civilian elevation and coastline inputs are verified as one fail-closed batch',()=>{
 const {verifyCollection}=require('../scripts/verify-public-civil-source.cjs');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'vp-public-civil-batch-'));
 try{
  fs.mkdirSync(path.join(dir,'tiles'));
  const a=Buffer.from('one declared original terrain sample');
  const b=Buffer.from('one declared original coastline sample');
  fs.writeFileSync(path.join(dir,'tiles','height.r16'),a);
  fs.writeFileSync(path.join(dir,'tiles','coast.geojson'),b);
  const source=(localFile,kind,license,bytes)=>({
   localFile,kind,license,attribution:'Original author fixture',
   sourceUrl:'https://example.org/civilian-dataset/'+localFile,
   observedOn:'2025-01-01',retrievedOn:'2026-11-09',
   licenseReviewedOn:'2026-11-09',
   sha256:crypto.createHash('sha256').update(bytes).digest('hex')
  });
  const entries=[
   source('tiles/height.r16','public-civilian-elevation','CC0-1.0',a),
   source('tiles/coast.geojson','public-civilian-shoreline','CC-BY-4.0',b)
  ];
  const first=verifyCollection(entries,dir);
  assert.equal(first.inputCount,2);
  assert.equal(first.records.length,2);
  assert.equal(first.manifestSha256,verifyCollection([...entries].reverse(),dir).manifestSha256);
  assert.equal(first.verifiedLocalIntegrity,true);
  assert.equal(first.verifiedExternalAuthenticity,false);
  assert.equal(first.verifiedAdenCoverage,false);
  assert.equal(first.usableForNativeTerrain,false);
  assert.ok(Object.isFrozen(first.records));
  assert.throws(()=>verifyCollection([...entries,entries[0]],dir),/duplicate/);
  assert.throws(()=>verifyCollection([],dir),/1 to 49/);
  assert.throws(()=>verifyCollection(Array(50).fill(entries[0]),dir),/1 to 49/);
  fs.writeFileSync(path.join(dir,'tiles','coast.geojson'),'modified coastline bytes');
  assert.throws(()=>verifyCollection(entries,dir),/hash mismatch/,
   'even the second invalid file invalidates the whole local terrain bundle');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('civilian-only import rejects linked paths and hidden folder traversal aliases',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'vp-public-civil-path-'));
 try{
  fs.mkdirSync(path.join(dir,'tiles'));
  const bytes='single original local DEM fixture';
  fs.writeFileSync(path.join(dir,'tiles','height.r16'),bytes);
  const r={kind:'public-civilian-elevation',license:'public-domain',
   sourceUrl:'https://example.org/public/r16',observedOn:'2024-01-01',
   retrievedOn:'2026-11-09',licenseReviewedOn:'2026-11-09',
   sha256:crypto.createHash('sha256').update(bytes).digest('hex')};
  assert.equal(verify({...r,localFile:'tiles/height.r16'},dir).verifiedLocalIntegrity,true);
  for(const localFile of ['tiles//height.r16','tiles/./height.r16','./tiles/height.r16'])
   assert.throws(()=>verify({...r,localFile},dir),/unsafe relative/);
  // Windows CI separately tests actual directory junctions with the packaged
  // executable. Unprivileged Windows Node workers may prohibit symlink creation.
  if(process.platform!=='win32'){
   fs.symlinkSync(path.join(dir,'tiles','height.r16'),path.join(dir,'alias.r16'));
   fs.symlinkSync(path.join(dir,'tiles'),path.join(dir,'shortcut'),'dir');
   assert.throws(()=>verify({...r,localFile:'alias.r16'},dir),/linked or redirected/);
   assert.throws(()=>verify({...r,localFile:'shortcut/height.r16'},dir),/linked or redirected/);
  }
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
