'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const crypto=require('node:crypto');
const Export=require('../scripts/export-ue5-heightmaps.cjs');
const {verify}=require('../scripts/verify-ue5-tile-pack.cjs');
const native=fs.readFileSync(path.resolve(__dirname,
 '../Unreal/Veilpoint/Source/Veilpoint/VPCityTerrainStreamActor.cpp'),'utf8');
const header=fs.readFileSync(path.resolve(__dirname,
 '../Unreal/Veilpoint/Source/Veilpoint/VPCityTerrainStreamActor.h'),'utf8');
const editor=fs.readFileSync(path.resolve(__dirname,
 '../scripts/ue5-author-aden-terrain-lab.py'),'utf8');
const project=JSON.parse(fs.readFileSync(path.resolve(__dirname,
 '../Unreal/Veilpoint/Veilpoint.uproject'),'utf8'));
const build=fs.readFileSync(path.resolve(__dirname,
 '../Unreal/Veilpoint/Source/Veilpoint/Veilpoint.Build.cs'),'utf8');
const source=Object.freeze({provider:'Original VEILPOINT test terrain',
 observedDate:'2026-11-10',license:'Original authored synthetic test art',
 reference:'original continuous synthetic terrain for standalone native map',
 scope:'public-terrain',type:'artist-blockout'});
function tile(tx,tz){
 const n=17,s=512/(n-1);
 return {tx,tz,gridSize:n,source,
  samples:Array.from({length:n*n},(_,i)=>{
   const x=tx*512+(i%n)*s,z=tz*512+Math.floor(i/n)*s;
   return 10+.022*x+.016*z;
  })};
}
function documentFor(tiles){
 return {format:'veilpoint-heightfield-v1',
  coordinateSystem:'local-metre-unreferenced',
  title:'Original unsurveyed native tile interoperability fixture',tiles};
}
function withTilePack(fn){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'veilpoint-terrain-'));
 try{
  const result=Export.convertHeightDocument(documentFor(
   [tile(-1,0),tile(0,0),tile(0,1)]));
  for(const f of result.files)
   fs.writeFileSync(path.join(dir,`aden_x${f.tx}_z${f.tz}_505.r16`),f.buffer);
  fs.writeFileSync(path.join(dir,'IMPORT_MANIFEST.json'),
   JSON.stringify(result.manifest));
  return fn(dir,result);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
}
test('real exporter writes an isolated native 3-tile R16 pack with SHA and both seam orientations',()=>{
 withTilePack((dir,result)=>{
  const validated=verify(dir);
  assert.deepEqual(validated,{tiles:3,seams:2,sourceStillUnverified:true,
   realAdenCoverageVerified:false,missingTilesNotInferred:true});
  assert.equal(result.files.length,3);
  assert.deepEqual(result.manifest.layers.map(l=>l.worldOriginCm),
   [[-51200,0],[0,0],[0,51200]]);
  for(const f of result.files){
   const actual=fs.readFileSync(path.join(dir,`aden_x${f.tx}_z${f.tz}_505.r16`));
   assert.equal(actual.length,505*505*2);
   assert.equal(crypto.createHash('sha256').update(actual).digest('hex'),f.sha256);
  }
 });
});
test('native file gate rejects tampering and even legitimate-hash but nonmatching border pixels',()=>{
 withTilePack((dir,result)=>{
  const file=result.manifest.layers[1].filename,
   full=path.join(dir,file),b=fs.readFileSync(full);
  b[120]=b[120]^0xff;
  fs.writeFileSync(full,b);
  assert.throws(()=>verify(dir),/Corrupt or tampered R16/);
 });
 withTilePack((dir,result)=>{
  const target=result.manifest.layers[1],full=path.join(dir,target.filename);
  const b=fs.readFileSync(full);
  // Tile x=0, z=0: west border is shared with x=-1.
  b.writeUInt16LE(b.readUInt16LE(0)+13,0);
  fs.writeFileSync(full,b);
  const manifest={...result.manifest,
   layers:result.manifest.layers.map(l=>l.tile===target.tile?
    {...l,sha256:crypto.createHash('sha256').update(b).digest('hex')}:l)};
  fs.writeFileSync(path.join(dir,'IMPORT_MANIFEST.json'),JSON.stringify(manifest));
  assert.throws(()=>verify(dir),/Native R16 seam mismatch/);
 });
});
test('manifest import and runtime loader require the exact same 505-pixel endian, scale and original tile identities',()=>{
 for(const text of [
  'veilpoint-ue5-landscape-r16-candidate-v1',
  'unsigned-16-bit-little-endian','IMPORT_MANIFEST.json',
  'sourceGridMetresPerUnit','heightmapWidth','heightmapHeight',
  'xyScaleCm','quantizationMetresPerStep',
  'recommendedLandscapeActorZCm','worldOriginCm',
  'GetSHA256Signature','Hash.ToString().Equals',
  'aden_x%d_z%d_505.r16',
  'File!=VPCityTerrain::TileFilename(Id)',
  'OutBytes.Num()!=VPCityTerrain::BytesPerTile'
 ])assert.ok(native.includes(text),text);
 assert.match(native,/FPaths::Combine\(FPaths::ProjectSavedDir\(\),\s*TEXT\("CityTiles"\)/);
 assert.match(native,/const uint16 Raw=uint16\(Bytes\[At\]\) \| \(uint16\(Bytes\[At\+1\]\)<<8\)/);
 assert.match(native,/\(MidpointMetres\+\(int32\(Raw\)-32768\)\*HeightStepMetres\)\*100\.f/);
 assert.match(native,/SampleSpacingCm=float\(Spacing\)/);
});
test('native procedural geometry has proper upper-face winding, slope normals, collision and a strict 9 tile budget',()=>{
 assert.ok(project.Plugins.some(p=>p.Name==='ProceduralMeshComponent'&&p.Enabled));
 assert.match(build,/"ProceduralMeshComponent"/);
 assert.match(build,/"Json"/);
 assert.match(header,/class VEILPOINT_API AVPCityTerrainStreamActor : public AActor/);
 assert.match(header,/int32 SampleStride=8/);
 assert.match(header,/int32 LoadRadiusTiles=1/);
 assert.match(header,/bool bCreateTerrainCollision=true/);
 assert.match(native,/const int32 Side=Last\/Step\+1/);
 assert.match(native,/Normals\.Add\(FVector\(-Dx,-Dy,1\.f\)\.GetSafeNormal\(\)\)/);
 assert.match(native,/Triangles\.Append\(\{A,B,D,B,E,D\}\)/);
 assert.match(native,/CreateMeshSection_LinearColor\(0,Vertices,Triangles,Normals/);
 assert.match(native,/constexpr int32 TileBudget=9/);
 assert.match(native,/VPCityTileGrid::CandidateTiles\(Center,Radius\)/);
 assert.match(native,/if\(!Desired\.Contains\(It\.Key\(\)\)\)/);
 assert.match(native,/It\.Value\(\)->DestroyComponent|It\.Value\(\)\.Get\(\)\)It\.Value\(\)->DestroyComponent/);
 assert.doesNotMatch(native,/https?:|SpawnActor.*Enemy|DownloadToMemory|GEngine->Exec/);
});
test('standalone Unreal Editor authoring never alters default BR, CH01, old checkpoints, or existing maps',()=>{
 assert.match(editor,/PACKAGE = "\/Game\/Maps\/Aden_TerrainLab"/);
 assert.match(editor,/os\.path\.isfile\(LEVEL_FILE\)/);
 assert.match(editor,/raise RuntimeError\("Aden_TerrainLab already exists; refusing overwrite"\)/);
 assert.match(editor,/\/Script\/Veilpoint\.VPCityTerrainStreamActor/);
 assert.match(editor,/\/Script\/Engine\.GameModeBase/);
 assert.match(editor,/actors\.spawn_actor_from_class\(\s*native,/);
 assert.match(editor,/levels\.save_current_level\(\)/);
 assert.match(editor,/Saved\/CityTiles/);
 assert.doesNotMatch(editor,/VPStoryGameMode|VPWorldBootstrap|BR96|DeleteLevel|remove_existing/);
});
