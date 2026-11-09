'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {generate,obj,exportTo}=require('../scripts/export-original-civic-court.cjs');
test('civilian architectural mesh is deterministic, nonempty, valid OBJ and locally scaled',()=>{
 const s=generate(),a=obj(s);assert.equal(a,obj(generate()));
 assert.equal(s.rooms.length,2);assert.equal(s.surveyed,false);
 assert.ok(s.faces.length>60);assert.equal(s.vertices.length%8,0);
 for(const f of s.faces){assert.equal(f.indices.length,4);
  for(const i of f.indices)assert.ok(i>=1&&i<=s.vertices.length);}
 for(const v of s.vertices)assert.ok(v.every(Number.isFinite));
 assert.ok(s.vertices.every(v=>v[0]>=0&&v[0]<=35&&v[1]>=0&&v[1]<=32));
 assert.equal(a.split('\n').filter(l=>l.startsWith('f ')).length,s.faces.length);
});
test('both actual room entrance openings and partition openings remain unobstructed',()=>{
 const s=generate();
 for(const room of s.rooms){
  const [x,y,w,d]=room.footprint,door=room.entry[0],partition=room.interiorPassage[0];
  assert.ok(door>x&&door<x+w);
  assert.ok(room.entryWidth>=1.2&&room.roofless);
  const front=s.faces.filter(f=>f.name.startsWith(room.name+'_front_'));
  assert.ok(front.length>0);
  const walls=s.faces.filter(f=>f.name.startsWith(room.name+'_partition_'));
  assert.ok(walls.length>0);
  assert.ok(partition>x&&partition<x+w);
  assert.ok(room.interiorPassage[1]>y&&room.interiorPassage[1]<y+d);
 }
 assert.equal(s.walkways.length,3);
});
test('export writes real inspectable assets without overwriting existing files',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'vp-civic-'));
 try{
  const dir=path.join(root,'court'),result=exportTo(dir);
  assert.ok(result.vertices>100&&result.faces>60);
  assert.equal(fs.readFileSync(result.file,'utf8'),obj(generate()));
  const meta=JSON.parse(fs.readFileSync(path.join(dir,'civic_court_metadata.json')));
  assert.equal(meta.actualAdenBuildingCoverageVerified,false);
  assert.equal(meta.collisionTestedInPIE,false);
  assert.throws(()=>exportTo(dir),/exists/);
 }finally{fs.rmSync(root,{recursive:true,force:true})}
});
