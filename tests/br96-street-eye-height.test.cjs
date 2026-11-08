'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const Street=require('../src/br96-street-view.js');
const client=fs.readFileSync(path.resolve(__dirname,'../src/br96-client.js'),'utf8');

function capture(subject){
 const painted=[];
 let fill='';
 const ctx={
  set fillStyle(value){fill=value;},
  set strokeStyle(_value){},
  set lineWidth(_value){},
  set font(_value){},
  set globalAlpha(_value){},
  fillRect(x,y,w,h){painted.push({fill,x,y,w,h});},
  fillText(){},beginPath(){},moveTo(){},lineTo(){},stroke(){}
 };
 const input={width:700,height:480,subject,yaw:0,obstacles:[
  {x:0,z:-12,w:10,d:1,h:2.4,type:'aden-fishhall-wall'}],
  squad:[],visible:[],visibilityMeters:95,weather:{code:'clear'}};
 const unmodified=JSON.stringify(input);
 const model=Street.draw(ctx,input);
 assert.equal(JSON.stringify(input),unmodified,'view-only render must never mutate server data');
 return {painted,model};
}
test('server-owned crouch posture lowers public city eye plane but never modifies position or rays',()=>{
 const standing=capture({id:1,x:0,z:0,crouched:false});
 const crouched=capture({id:1,x:0,z:0,crouched:true});
 assert.equal(standing.model.eyeHeight,Street.EYE_STANDING);
 assert.equal(crouched.model.eyeHeight,Street.EYE_CROUCH);
 assert.ok(crouched.model.eyeHeight<standing.model.eyeHeight);
 assert.deepEqual(crouched.model.rays,standing.model.rays,
  'local pose changes presentation only, not wall physics or visible actors');
 const wallY=a=>a.painted.filter(p=>p.fill.startsWith('rgb('))
   .map(p=>p.y).sort((x,y)=>x-y)[0];
 assert.ok(wallY(crouched)<wallY(standing),
  'nearby public facade actually changes screen perspective at low stance');
});
test('no client-selected stance can fabricate people or bypass public visibility limits',()=>{
 const subject={id:1,x:0,z:0,crouched:true};
 const model=Street.frame({subject,obstacles:[],visible:[],squad:[]});
 assert.equal(model.seen.length,0);
 assert.equal(model.eyeHeight,Street.EYE_CROUCH);
 const defaultPose=Street.frame({subject:{id:1,x:0,z:0},obstacles:[]});
 assert.equal(defaultPose.eyeHeight,Street.EYE_STANDING);
 assert.match(client,/subject=w\.spectatorView/);
 assert.match(client,/visible:w\.visible\|\|\[\]/);
 assert.match(client,/streetYaw/);
});
