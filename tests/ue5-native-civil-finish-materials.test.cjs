'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {prepare}=require('../scripts/prepare-ue5-terrain-lab.cjs');
const Street=require('../scripts/prepare-ue5-civil-street.cjs');
const Finish=require('../scripts/prepare-ue5-civil-finishes.cjs');
const {FINISHES,applyCivilFinishes}=require('../src/aden-civic-finishes.cjs');
const native=fs.readFileSync(path.resolve(__dirname,'../scripts/ue5-author-civil-street.py'),'utf8');
test('181 original street actors resolve to <=27 deterministic material variants with exact shared roughness',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'vp-finish-ue5-'));
 try{
  prepare(dir);
  const street=Street.build(dir),first=applyCivilFinishes(street);
  assert.equal(street.parts.length,181);
  assert.equal(first.partCount,181);
  const unique=new Map();
  for(const item of first.assignments){
   const p=street.parts.find(x=>x.id===item.partId);
   assert.ok(p);
   assert.equal(p.finish,item.baseFinish);
   const digest=crypto.createHash('sha256').update(p.id+'|'+p.finish).digest();
   assert.equal(item.variant,digest[0]%3);
   assert.deepEqual(item.baseColor,FINISHES[p.finish][item.variant]);
   const group=p.finish+'|'+item.variant;
   if(unique.has(group))assert.equal(unique.get(group),item.roughness,
     'one native shader material must not represent conflicting per-part roughness');
   unique.set(group,item.roughness);
   assert.ok(item.roughness>=.63&&item.roughness<=.88);
   assert.equal(item.collisionUnchanged,true);
  }
  assert.ok(unique.size>10&&unique.size<=27);
  assert.deepEqual(applyCivilFinishes(street),first);
  const initial=JSON.stringify(street);
  const saved=Street.write(dir);
  assert.ok(fs.existsSync(saved.filename));
  const fromDisk=Finish.write(dir);
  const sidecar=JSON.parse(fs.readFileSync(fromDisk.filename,'utf8'));
  assert.deepEqual(sidecar.assignments,first.assignments);
  assert.equal(sidecar.sourceR16Sha256,street.sourceR16Sha256);
  assert.equal(sidecar.partCount,181);
  assert.equal(JSON.stringify(street),initial,'render finishes may not alter original collision geometry');
  assert.throws(()=>Finish.write(dir),/EEXIST/,'never overwrite signed-off civilian art sidecar');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('UE5 material authoring consumes validated sidecar and creates actual shared BaseColor/Roughness shaders',()=>{
 assert.match(native,/def checked_finishes\(scene\):/);
 assert.match(native,/CIVIL_FINISH_VARIANTS\.json/);
 assert.match(native,/sourceR16Sha256.*scene\["sourceR16Sha256"\]/);
 assert.match(native,/hashlib\.sha256\(\(part\["id"\] \+ "\\|" \+ part\["finish"\]\)/);
 assert.match(native,/item\.get\("collisionUnchanged"\) is not True/);
 assert.match(native,/EXPECTED_PIECES = 181/);
 assert.match(native,/MaterialExpressionConstant3Vector/);
 assert.match(native,/MaterialExpressionConstant,/);
 assert.match(native,/MP_BASE_COLOR/);
 assert.match(native,/MP_ROUGHNESS/);
 assert.match(native,/mesh\.set_material\(0, materials\[\(finish, variant\)\]\)/);
 assert.match(native,/27 deterministic variation/);
 assert.match(native,/save_current_level/);
 assert.doesNotMatch(native,/\/Game\/Maps\/CH01|verified real Aden survey/i);
});
