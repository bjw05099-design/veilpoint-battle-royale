'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const View=require('../src/br96-street-view.js');

test('BR96 vertical 1st-person camera has strictly bounded local pitch',()=>{
 assert.equal(View.clampPitch(0),0);
 assert.equal(View.clampPitch(999),View.MAX_PITCH);
 assert.equal(View.clampPitch(-999),-View.MAX_PITCH);
 assert.throws(()=>View.clampPitch(NaN),/invalid_view_pitch/);
 assert.throws(()=>View.clampPitch(Infinity),/invalid_view_pitch/);
 const subject={x:0,z:0,id:1};
 const base=View.frame({subject});
 const up=View.frame({subject,pitch:View.MAX_PITCH});
 assert.equal(base.pitch,0);
 assert.equal(up.pitch,View.MAX_PITCH);
 assert.deepEqual(up.rays,base.rays,'vertical camera pitch must not invent wall positions or remote visibility');
 assert.deepEqual(up.seen,base.seen,'look pitch must not add a person to the authenticated server snapshot');
});
test('vertical look shifts the drawn horizon without changing public building raycasts',()=>{
 const trace=pitch=>{
  const rects=[];
  const ctx={fillRect:(...a)=>rects.push(a),beginPath(){},moveTo(){},lineTo(){},stroke(){},
   fillText(){},strokeRect(){},arc(){},save(){},restore(){},setLineDash(){}};
  const model=View.draw(ctx,{width:800,height:480,subject:{id:1,x:0,z:0},yaw:0,
   pitch,obstacles:[],squad:[],visible:[],visibilityMeters:75});
  return {model,rects};
 };
 const level=trace(0),up=trace(.25),down=trace(-.25);
 assert.ok(up.rects[0][3]>level.rects[0][3]);
 assert.ok(down.rects[0][3]<level.rects[0][3]);
 assert.deepEqual(up.model.rays,level.model.rays);
 assert.deepEqual(down.model.rays,level.model.rays);
});
test('BR96 desktop pointer movementY changes only local view; keyboard fallback works',()=>{
 const client=fs.readFileSync(path.join(__dirname,'../src/br96-client.js'),'utf8');
 assert.match(client,/event\.movementY/);
 assert.match(client,/streetPitch=window\.VeilpointBR96StreetView\.clampPitch/);
 assert.match(client,/subject:litSubject,yaw:streetYaw,pitch:streetPitch/);
 assert.match(client,/\['KeyI','KeyK'\]/);
 assert.match(client,/streetPitch=0/);
 assert.match(client,/document\.pointerLockElement!==canvas/);
 assert.doesNotMatch(client,/request\('\/move',[\s\S]{0,150}streetPitch/);
});
