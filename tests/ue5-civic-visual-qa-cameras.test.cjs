'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {makeQuarter}=require('../src/aden-civic-kit.cjs');
const {buildStreet}=require('../src/aden-civic-street-details.cjs');
const source=fs.readFileSync(path.join(__dirname,'../scripts/ue5-civic-visual-qa-cameras.py'),'utf8');
const originalElevation=(x,z)=>60+.01*x+.008*z;
test('native visual QA uses all three REAL nested street/front entrances from the current original civilian scene',()=>{
 const quarter=makeQuarter(originalElevation),scene=buildStreet(quarter,originalElevation);
 assert.equal(scene.entrances.length,3);
 for(const entry of scene.entrances){
  assert.equal(typeof entry.publicStreetMetres.x,'number');
  assert.equal(entry.publicStreetMetres.z,57);
  assert.equal(typeof entry.publicFrontMetres.x,'number');
  assert.ok(entry.publicFrontMetres.z>entry.publicStreetMetres.z+1);
  assert.equal(Object.hasOwn(entry,'x'),false);
  assert.equal(Object.hasOwn(entry,'z'),false);
 }
 assert.match(source,/street, front = e\.get\("publicStreetMetres"\), e\.get\("publicFrontMetres"\)/);
 assert.match(source,/if not isinstance\(street, dict\) or not isinstance\(front, dict\):/);
 assert.doesNotMatch(source,/\bx, z = e\.get\("x"\), e\.get\("z"\)/);
});
test('preview cameras use verified R16 terrain heights rather than absolute zero-height cameras',()=>{
 for(const snippet of ['CIVILIAN_QUARTER.json','IMPORT_MANIFEST.json',
  'aden_x0_z0_505.r16','hashlib.sha256(raw).hexdigest()',
  'scene["sourceR16Sha256"] != digest','quarter.get("sourceR16Sha256") != digest',
  'struct.unpack_from("<H", raw','ground = height_at(raw, manifest, x, z)',
  'ground + 1.7','ground_eye * 100','unreal.Rotator(0, yaw, 0)']){
  assert.ok(source.includes(snippet),snippet);
 }
 assert.doesNotMatch(source,/unreal\.Vector\(x \* 100, z \* 100, 180\)/);
});
test('isolated UE5 city camera preview neither mutates gameplay nor falsely claims real Aden survey',()=>{
 assert.match(source,/LEVEL = "\/Game\/Maps\/Aden_TerrainLab"/);
 assert.match(source,/if not world or LEVEL not in world\.get_path_name\(\)/);
 assert.match(source,/PREFIX = "VP_CIV_QA_CAMERA_"/);
 assert.match(source,/any\(label\.startswith\(PREFIX\) for label in labels\)/);
 assert.match(source,/unreal\.CameraActor/);
 assert.match(source,/Author all 181 civilian street pieces first/);
 assert.match(source,/Orient and inspect manually; no native PIE or surveyed coverage verified/);
 assert.doesNotMatch(source,/save_current_level|set_collision_enabled|destroy_actor|ServerTravel/);
});
