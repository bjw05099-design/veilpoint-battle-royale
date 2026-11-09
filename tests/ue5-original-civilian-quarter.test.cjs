'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {prepare}=require('../scripts/prepare-ue5-terrain-lab.cjs');
const Civil=require('../src/aden-civic-kit.cjs');
const Kit=require('../scripts/prepare-ue5-civilian-quarter.cjs');
const Pack=require('../scripts/verify-ue5-tile-pack.cjs');
const editor=fs.readFileSync(path.resolve(__dirname,
 '../scripts/ue5-author-civilian-quarter.py'),'utf8');

function withSyntheticPack(fn){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'veilpoint-civil-kit-')),
  target=path.join(root,'CityTiles');
 try{prepare(target);return fn(target)}
 finally{fs.rmSync(root,{recursive:true,force:true})}
}
function intersectsAabb(x,z,r,p){
 if(!p.solid||p.role==='flat-roof'||p.role==='entrance-lintel')return false;
 // Floor/raised awnings do not block walking inside the room.
 if(p.role==='floor'||p.role==='entry-awning')return false;
 const dx=Math.max(0,Math.abs(x-p.x)-p.w/2),
  dz=Math.max(0,Math.abs(z-p.z)-p.d/2);
 return dx*dx+dz*dz<r*r;
}
test('three original civic archetypes have real, metre-grounded walls, roofs and north/south entry geometry',()=>{
 withSyntheticPack(dir=>{
  const kit=Kit.build(dir);
  assert.equal(kit.format,'veilpoint-original-civilian-quarter-v1');
  assert.equal(kit.coordinateSystem,'local-metre-unreferenced');
  assert.equal(kit.actualAdenCoverageVerified,false);
  assert.equal(kit.restrictedFacilityModel,false);
  assert.equal(kit.buildings.length,3);
  assert.equal(new Set(kit.buildings.map(b=>b.type)).size,3);
  assert.equal(kit.parts.length,39);
  assert.equal(new Set(kit.parts.map(b=>b.id)).size,39);
  for(const building of kit.buildings){
   const pieces=kit.parts.filter(p=>p.owner===building.id);
   assert.equal(pieces.length,13);
   assert.ok(building.doorWidthMetres>=4.4);
   assert.ok(building.groundMetres>0);
   const floor=pieces.find(p=>p.role==='floor'),
    roof=pieces.find(p=>p.role==='flat-roof');
   assert.ok(floor&&roof);
   assert.ok(Math.abs((floor.y-floor.h/2)-building.groundMetres)<1e-9);
   assert.ok((roof.y-roof.h/2)-(floor.y+floor.h/2)>3,
    'interior public clear height is above human capsule');
   const wallRoles=['front-west','front-east','rear-wall','west-wall','east-wall'];
   assert.ok(wallRoles.every(role=>pieces.some(p=>p.role===role)));
   // A human-sized radius can pass through the real open SOUTH wall,
   // reach the room center and leave again WITHOUT intersecting furniture.
   for(const [x,z] of [
     [building.x,building.z-building.d/2-2],
     [building.x,building.z-building.d/2],
     [building.x,building.z-building.d/4],
     [building.x,building.z],
     [building.x,building.z+building.d/4]
   ])assert.ok(!pieces.some(p=>intersectsAabb(x,z,.85,p)),
    'No physical wall/furniture may cross entry centerline: '+building.id);
  }
 });
});
test('civilian scene output is reproducible from actual hash-verified original 505 R16 tile, no overwrites',()=>{
 withSyntheticPack(dir=>{
  assert.equal(Pack.verify(dir).seams,12);
  const result=Kit.write(dir);
  assert.equal(result.buildings,3);
  assert.equal(result.pieces,39);
  const actual=JSON.parse(fs.readFileSync(result.filename,'utf8'));
  assert.deepEqual(actual,Kit.build(dir));
  assert.ok(actual.sourceR16Sha256);
  assert.equal(actual.sourceR16Sha256.length,64);
  assert.equal(actual.terrainSourceTile,'aden:0:0');
  assert.equal(actual.terrainSampleSourceUnverified,true);
  assert.throws(()=>Kit.write(dir),/already exists/);
  assert.equal(fs.readdirSync(dir).length,11,'9 R16 + manifest + civil layout');
  assert.equal(Pack.verify(dir).tiles,9);
  assert.equal(Civil.CATALOG.length,3);
 });
});
test('civilian kit refuses changed terrain, unreviewed geographic assets and unverified actor heights',()=>{
 withSyntheticPack(dir=>{
  const layer=JSON.parse(fs.readFileSync(path.join(dir,'IMPORT_MANIFEST.json'),'utf8'))
   .layers.find(p=>p.tile==='aden:0:0');
  const file=path.join(dir,layer.filename),raw=fs.readFileSync(file);
  raw[222]^=1;
  fs.writeFileSync(file,raw);
  assert.throws(()=>Kit.build(dir),/Corrupt or tampered R16/);
 });
 withSyntheticPack(dir=>{
  const manifestPath=path.join(dir,'IMPORT_MANIFEST.json'),
   doc=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
  doc.title='Surveyed actual Aden 2026 satellite city';
  fs.writeFileSync(manifestPath,JSON.stringify(doc));
  assert.throws(()=>Kit.build(dir),/only for original unverified terrain lab/);
 });
 assert.throws(()=>Civil.makeQuarter(()=>Infinity),/foundation height/);
});
test('native UE5 Editor authoring is restricted to preview map and grounds all 39 parts in cm',()=>{
 assert.match(editor,/PACKAGE = "\/Game\/Maps\/Aden_TerrainLab"/);
 assert.match(editor,/if not world or PACKAGE not in world\.get_path_name\(\)/);
 assert.match(editor,/sourceR16Sha256/);
 assert.match(editor,/hashlib\.sha256\(handle\.read\(\)\)\.hexdigest\(\)/);
 assert.match(editor,/len\(parts\) != 39/);
 assert.match(editor,/if any\(label\.startswith\("VP_CIV_"\)/);
 assert.match(editor,/unreal\.StaticMeshActor/);
 assert.match(editor,/component\.set_static_mesh\(cube\)/);
 assert.match(editor,/actor\.set_actor_scale3d\(unreal\.Vector\(p\["w"\], p\["d"\], p\["h"\]\)\)/);
 assert.match(editor,/unreal\.CollisionEnabled\.QUERY_AND_PHYSICS/);
 assert.match(editor,/unreal\.MaterialExpressionConstant3Vector/);
 assert.match(editor,/levels\.save_current_level|editor_levels\.save_current_level/);
 assert.doesNotMatch(editor,/https?:\/\/|\/Game\/Maps\/CH01|VPStoryGameMode|Enemy|ServerTravel/);
});
