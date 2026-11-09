'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {prepare}=require('../scripts/prepare-ue5-terrain-lab.cjs');
const Quarter=require('../scripts/prepare-ue5-civilian-quarter.cjs');
const Street=require('../scripts/prepare-ue5-civil-street.cjs');
const Facade=require('../src/aden-civic-street-details.cjs');
const Verified=require('../scripts/verify-ue5-tile-pack.cjs');
const editor=fs.readFileSync(path.resolve(__dirname,
 '../scripts/ue5-author-civil-street.py'),'utf8');

function withR16(fn){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'vp-street-'));
 const tiles=path.join(dir,'CityTiles');
 try{prepare(tiles);return fn(tiles)}
 finally{fs.rmSync(dir,{recursive:true,force:true})}
}
function groundFn(directory){
 const manifest=JSON.parse(fs.readFileSync(path.join(
  directory,'IMPORT_MANIFEST.json'),'utf8'));
 const layer=manifest.layers.find(l=>l.tile==='aden:0:0');
 const bytes=fs.readFileSync(path.join(directory,layer.filename));
 return (x,z)=>Quarter.decodeHeight(bytes,manifest,x,z);
}
function circleHitsBox(x,z,r,p){
 const dx=Math.max(0,Math.abs(x-p.x)-p.w/2),
  dz=Math.max(0,Math.abs(z-p.z)-p.d/2);
 return dx*dx+dz*dz<r*r;
}
test('original city strip contributes a continuous 33-cell publicly walkable terrain-grounded street',()=>{
 withR16(dir=>{
  const scene=Street.build(dir),ground=groundFn(dir);
  assert.equal(scene.parts.length,181);
  assert.equal(scene.streets.length,33);
  assert.equal(scene.entrances.length,3);
  assert.equal(scene.civilBuildings,3);
  assert.equal(scene.sharedPedestrianStreet,true);
  assert.equal(scene.actualAdenCoverageVerified,false);
  assert.equal(scene.sensitiveOperationalSites,false);
  assert.equal(scene.yearAccuracyVerified,false);
  const walkway=scene.parts.filter(p=>p.role==='walk-paver');
  assert.equal(walkway.length,33);
  for(let i=0;i<walkway.length;i++){
   const p=walkway[i],z=57,x=50+i*4;
   assert.equal(p.x,x);assert.equal(p.z,z);
   assert.equal(p.solid,false,'a visual paver must never replace actual terrain collision');
   assert.ok(Math.abs((p.y-p.h/2)-(ground(x,z)+.015))<1e-8);
   if(i)assert.ok(p.x-walkway[i-1].x<=Math.min(p.w,walkway[i-1].w),
    'the pavement seam must stay closed');
  }
  assert.ok(scene.parts.filter(p=>p.role==='entry-paver').length>9);
  const road=walkway.map(p=>p.y);
  assert.ok(Math.max(...road)-Math.min(...road)<2.5,
   'the short sidewalk must not conceal unsupported extreme terrain leaps');
  assert.deepEqual(scene.entrances.map(e=>e.doorwayMetres),[4.4,4.8,5.2]);
 });
});
test('historical-type ORIGINAL varied facades add actual roof courses, louvres, awnings and arcade arch hints',()=>{
 withR16(dir=>{
  const scene=Street.build(dir),quarter=Quarter.build(dir);
  const ownerIds=quarter.buildings.map(b=>b.id);
  const expectations=[
   ['civic-market-shop','market-canopy-stripe'],
   ['public-craft-hall','stone-vent-cornice'],
   ['covered-civil-arcade','arcade-upper-arch-trim']
  ];
  assert.deepEqual(new Set(Object.keys(scene.materials)),
   new Set(Object.keys(Facade.MATERIALS)));
  assert.ok(new Set(scene.parts.map(p=>p.id)).size===scene.parts.length);
  for(const [id,style] of expectations){
   const arr=scene.parts.filter(p=>p.owner===id);
   assert.ok(arr.some(p=>p.role===style));
   assert.equal(arr.filter(p=>p.role.endsWith('louver')).length,8);
   assert.equal(arr.filter(p=>p.role.startsWith('roof-')).length,4);
   assert.ok(arr.some(p=>p.role==='entry-frieze'));
   assert.ok(arr.some(p=>p.role==='left-wood-screen'));
   assert.ok(arr.some(p=>p.role==='right-wood-screen'));
   assert.ok(arr.some(p=>p.finish==='aged-wood'));
   assert.ok(arr.some(p=>p.finish==='warm-lime'));
  }
  assert.deepEqual(ownerIds,['civic-market-shop','public-craft-hall',
   'covered-civil-arcade']);
  assert.ok(scene.parts.some(p=>p.owner==='public-promenade'&&p.role==='lamp-column'));
 });
});
test('actual physical collision remains clear across all open public entry approaches and shared boulevard',()=>{
 withR16(dir=>{
  const quarter=Quarter.build(dir),scene=Street.build(dir);
  const original=quarter.parts.filter(p=>p.solid&&
   !['floor','flat-roof','entrance-lintel'].includes(p.role));
  const newSolids=scene.parts.filter(p=>p.solid);
  const all=[...original,...newSolids];
  for(const b of quarter.buildings){
   const entry=scene.entrances.find(e=>e.id===b.id);
   assert.ok(entry);
   const minZ=entry.publicStreetMetres.z,
    maxZ=entry.publicInteriorMetres.z;
   // 0.85m-radius person walks from civic promenade through an actual
   // 4m-plus open doorway and into each public building. Roof-height
   // parapets must not count as a ground-level obstruction.
   for(let z=minZ;z<=maxZ;z+=.5){
    const playerBase=groundFn(dir)(b.x,z);
    const hits=all.filter(p=>{
     if(p.y-p.h/2>playerBase+2.0||p.y+p.h/2<playerBase+.3)
      return false;
     return circleHitsBox(b.x,z,.85,p);
    });
    assert.deepEqual(hits.map(p=>p.role),[],
     'street-to-shop doorway obstructed at '+b.id+' z='+z);
   }
  }
  for(let x=50;x<=178;x+=.5){
   const z=57,ground=groundFn(dir)(x,z);
   assert.ok(!all.some(p=>
    p.y-p.h/2<ground+2.0&&p.y+p.h/2>ground+.3&&
    circleHitsBox(x,z,.85,p)),
    'shared boulevard intersects solid scenery at x='+x);
  }
 });
});
test('R16-sourced street export is deterministic, refuses overwrite and rejects altered DEM',()=>{
 withR16(dir=>{
  const first=Street.build(dir),second=Street.build(dir);
  assert.deepEqual(first,second);
  assert.equal(first.sourceR16Sha256,Quarter.build(dir).sourceR16Sha256);
  assert.equal(first.linkedOriginalQuarterFormat,'veilpoint-original-civilian-quarter-v1');
  assert.equal(first.sourceTerrainUnverified,true);
  assert.equal(Verified.verify(dir).seams,12);
  const written=Street.write(dir);
  assert.equal(written.components,181);
  assert.equal(written.pavedCells,33);
  assert.equal(written.entrances,3);
  assert.equal(written.actualAdenCoverageVerified,false);
  const stored=JSON.parse(fs.readFileSync(written.filename,'utf8'));
  assert.deepEqual(stored,first);
  assert.throws(()=>Street.write(dir),/overwrite refused/);
  assert.equal(fs.readdirSync(dir).length,11);
 });
 withR16(dir=>{
  const manifest=JSON.parse(fs.readFileSync(path.join(dir,'IMPORT_MANIFEST.json'),'utf8')),
   tile=manifest.layers.find(l=>l.tile==='aden:0:0'),
   filename=path.join(dir,tile.filename),bytes=fs.readFileSync(filename);
  bytes[100]^=1;fs.writeFileSync(filename,bytes);
  assert.throws(()=>Street.build(dir),/Corrupt or tampered R16/);
 });
});
test('standalone Editor import guards verified source, page locality, duplicate actors and exact scaled original meshes',()=>{
 assert.match(editor,/LEVEL = "\/Game\/Maps\/Aden_TerrainLab"/);
 assert.match(editor,/re\.fullmatch\(r"\[a-f0-9\]\{64\}", digest\)/);
 assert.match(editor,/hashlib\.sha256\(handle\.read\(\)\)\.hexdigest\(\)/);
 assert.match(editor,/not world or LEVEL not in world\.get_path_name\(\)/);
 assert.match(editor,/any\(label\.startswith\(PREFIX\) for label in labels\)/);
 assert.match(editor,/if not any\(label\.startswith\("VP_CIV_civic-market-shop-"\)/);
 assert.match(editor,/EXPECTED_PIECES = 181/);
 assert.match(editor,/unreal\.StaticMeshActor/);
 assert.match(editor,/mesh\.set_static_mesh\(cube\)/);
 assert.match(editor,/mesh\.set_collision_enabled\(/);
 assert.match(editor,/unreal\.Vector\(p\["x"\] \* 100, p\["z"\] \* 100, p\["y"\] \* 100\)/);
 assert.match(editor,/editor\.save_current_level\(\)/);
 assert.doesNotMatch(editor,/https?:|Enemy|BR96|ServerTravel|\/Game\/Maps\/CH01/);
});
