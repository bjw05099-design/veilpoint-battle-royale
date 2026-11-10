'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {prepare}=require('../scripts/prepare-ue5-terrain-lab.cjs');
const Kit=require('../scripts/prepare-ue5-civilian-quarter.cjs');
const Interior=require('../src/aden-civic-interiors.cjs');
const Prep=require('../scripts/prepare-ue5-civic-interiors.cjs');
const Editor=fs.readFileSync(path.resolve(__dirname,'../scripts/ue5-author-civic-interiors.py'),'utf8');
function withSyntheticTiles(fn){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'vp-real-civic-interiors-'));
 try{
  const dir=path.join(root,'CityTiles');prepare(dir);return fn(dir);
 }finally{fs.rmSync(root,{recursive:true,force:true})}
}
function intersectsWalkAisle(part,building,radius=.85){
 if(!part.solid)return false;
 // 3.1m-centre route, from front south door to rear interior. A human
 // capsule must pass at x=centerline without touching any solid fixture.
 const dx=Math.max(0,Math.abs(building.x-part.x)-part.w/2);
 return dx<radius&&
  part.z+part.d/2>=building.z-building.d/2+.4&&
  part.z-part.d/2<=building.z+building.d/2-.4;
}
test('3 genuinely distinct original civic public interiors expose collision-aware rooms and 3.1m clear continuous aisle',()=>{
 withSyntheticTiles(dir=>{
  const quarter=Kit.build(dir);
  const scene=Interior.createInteriors(quarter);
  assert.equal(scene.format,'veilpoint-original-civic-interiors-v1');
  assert.equal(scene.realAdenInteriorsVerified,false);
  assert.equal(scene.coordinateSystem,'local-metre-unreferenced');
  assert.equal(scene.sourceR16Sha256,quarter.sourceR16Sha256);
  assert.equal(scene.interiors.length,3);
  assert.equal(scene.parts.length,54);
  assert.equal(new Set(scene.parts.map(p=>p.id)).size,54);
  assert.equal(new Set(scene.interiors.map(p=>p.kind)).size,3);
  for(const building of quarter.buildings){
   const parts=scene.parts.filter(p=>p.owner===building.id);
   assert.equal(parts.length,18);
   assert.equal(scene.interiors.find(p=>p.id===building.id).walkableCentreAisleMetres,3.1);
   assert.ok(parts.some(p=>p.role==='west-alcove-divider'&&p.solid));
   assert.ok(parts.some(p=>p.role==='east-alcove-divider'&&p.solid));
   assert.ok(parts.some(p=>p.role.startsWith('ceiling-light')&&!p.solid));
   for(const part of parts){
    assert.equal(intersectsWalkAisle(part,building),false,
     'no furnished shelf, partition or table can block walk-in route: '+part.id);
    assert.ok(Math.abs(part.x-building.x)+part.w/2<=building.w/2-.4+1e-6);
    assert.ok(Math.abs(part.z-building.z)+part.d/2<=building.d/2-.4+1e-6);
    assert.ok(part.y-part.h/2>=building.groundMetres+.2-1e-7);
   }
  }
 });
});
test('actual original 505x505 R16 terrain pack must verify before writing public interiors and original scene is deterministic',()=>{
 withSyntheticTiles(dir=>{
  const one=Prep.build(dir),two=Prep.build(dir);
  assert.deepEqual(one,two);
  assert.equal(one.parts.length,54);
  assert.equal(one.terrainSourceTile,'aden:0:0');
  assert.equal(one.actualAdenCoverageVerified,false);
  assert.match(one.sourceR16Sha256,/^[a-f0-9]{64}$/);
  const result=Prep.write(dir);
  assert.equal(result.interiors,3);assert.equal(result.parts,54);
  const written=JSON.parse(fs.readFileSync(result.filename,'utf8'));
  assert.deepEqual(written,one);
  assert.throws(()=>Prep.write(dir),/already authored/);
  const manifest=JSON.parse(fs.readFileSync(path.join(dir,'IMPORT_MANIFEST.json')));
  const tile=manifest.layers.find(p=>p.tile==='aden:0:0');
  const raw=fs.readFileSync(path.join(dir,tile.filename));raw[101]^=1;
  fs.writeFileSync(path.join(dir,tile.filename),raw);
  assert.throws(()=>Prep.build(dir),/Corrupt or tampered R16/);
 });
});
test('original 3-building kit cannot be replaced with surveyed operational maps or blocked entrances',()=>{
 const fake={format:'veilpoint-original-civilian-quarter-v1',
  coordinateSystem:'local-metre-unreferenced',actualAdenCoverageVerified:true,buildings:[]};
 assert.throws(()=>Interior.createInteriors(fake),/Original, unverified/);
 withSyntheticTiles(dir=>{
  const quarter=Kit.build(dir);
  const forged={...quarter,buildings:quarter.buildings.map((b,i)=>i===0
   ?{...b,doorWidthMetres:.3}:b)};
  assert.throws(()=>Interior.createInteriors(forged),/entrance\/dimensions/);
 });
});
test('UE5 editor script spawns real collidable furnishings only on independent terrain lab and validates hash/source',()=>{
 assert.match(Editor,/MAP = "\/Game\/Maps\/Aden_TerrainLab"/);
 assert.match(Editor,/hashlib\.sha256\(stream\.read\(\)\)\.hexdigest\(\)/);
 assert.match(Editor,/world\.get_path_name\(\)/);
 assert.match(Editor,/VP_CIV_INT_/);
 assert.match(Editor,/Expected original civic shell must be authored first/);
 assert.match(Editor,/unreal\.StaticMeshActor/);
 assert.match(Editor,/mesh\.set_static_mesh\(cube\)/);
 assert.match(Editor,/unreal\.CollisionEnabled\.QUERY_AND_PHYSICS/);
 assert.match(Editor,/unreal\.CollisionEnabled\.NO_COLLISION/);
 assert.match(Editor,/save_current_level\(\)/);
 assert.doesNotMatch(Editor,/https?:\/\/|ServerTravel|\/Game\/Maps\/CH01|sensitive/);
});
