'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const Street=require('../src/br96-street-view.js');
const {createBrSquadServer}=require('../server/br-squad-server.cjs');
test('BR96 street view raycasts only public building surfaces from authenticated subject pose',()=>{
 assert.equal(Street.COLUMNS,210);
 assert.ok(Math.abs(Street.FOV-78*Math.PI/180)<1e-12);
 const north=Street.rayBox({x:0,z:0},{x:0,z:-1},{x:0,z:-12,w:4,d:4});
 assert.equal(north,10);
 assert.equal(Street.rayBox({x:0,z:0},{x:0,z:1},{x:0,z:-12,w:4,d:4}),Infinity);
 assert.equal(Street.rayBox({x:0,z:0},{x:1,z:0},{x:0,z:-12,w:4,d:4}),Infinity);
 const subject={x:0,z:0,id:1},wall={x:0,z:-11,w:8,d:2,h:5,type:'building'};
 const model=Street.frame({subject,yaw:0,obstacles:[wall],
   squad:[{x:2,z:-5,id:2,eligible:true},{x:-5,z:-8,id:3,eligible:false}],
   visible:[{x:0,z:-22,id:9},{x:8,z:-18,id:10}],
   visibilityMeters:95});
 assert.equal(model.rays.length,210);
 assert.ok(model.rays[105].distance>9&&model.rays[105].distance<11);
 assert.equal(model.seen.some(x=>x.id===9),false,'wall blocks observed rival');
 assert.equal(model.seen.some(x=>x.id===3),false,'withdrawn mate is not a live silhouette');
 assert.equal(model.seen.some(x=>x.id===2),true,'visible authorized teammate remains');
 assert.equal(model.seen.some(x=>x.id===10),true,'only server-observed non-occluded rival is drawn');
 assert.deepEqual(subject,{x:0,z:0,id:1});
 assert.deepEqual(wall,{x:0,z:-11,w:8,d:2,h:5,type:'building'});
});
test('BR96 view does not fabricate opponents and does not permit client-owned authority or invalid camera',()=>{
 const subject={x:3,z:7,id:1};
 const local=Street.frame({subject,yaw:0,obstacles:[],squad:[],visible:[]});
 assert.equal(local.seen.length,0);
 const east=Street.frame({subject,yaw:Math.PI/2,obstacles:[],visible:[{id:7,x:30,z:7}]});
 assert.equal(east.seen.length,1);
 assert.equal(Street.frame({subject,yaw:-Math.PI/2,obstacles:[],visible:[{id:7,x:30,z:7}]}).seen.length,0);
 assert.ok(Math.abs(Street.wrap(4*Math.PI))<1e-12);
 assert.throws(()=>Street.frame({subject:{x:NaN,z:0},yaw:0}),/server_subject_required/);
 assert.throws(()=>Street.frame({subject,yaw:Infinity}),/invalid_view_direction/);
 assert.throws(()=>Street.frame({subject,visible:{secret:true}}),/invalid_public_view/);
 assert.throws(()=>Street.draw(null,{width:700,height:700}),/invalid_street_view_canvas/);
});
test('BR96 static street renderer draws bounded panorama without mutating server snapshot',()=>{
 const calls=[];
 const ctx=new Proxy({},{
  get(_target,key){
   if(['fillRect','beginPath','moveTo','lineTo','stroke','fillText'].includes(key))
    return (...args)=>calls.push({key,args});
   return undefined;
  },
  set(){return true;}
 });
 const args={width:700,height:480,subject:{x:0,z:0,id:1},yaw:0,
  obstacles:[{x:0,z:-10,w:4,d:2,h:2.8,type:'dock-warehouse'}],
  civicGate:{x:0,z:-25,w:5,d:.7,h:2.4,state:'closed'},
  squad:[],visible:[],weather:{code:'sea-haze'}};
 const before=JSON.stringify(args);
 const drawn=Street.draw(ctx,args);
 assert.equal(drawn.rays.length,210);
 assert.ok(calls.filter(call=>call.key==='fillRect').length>10);
 assert.ok(calls.every(call=>call.args.every(arg=>typeof arg!=='number'||Number.isFinite(arg))));
 assert.equal(JSON.stringify(args),before,'camera never mutates the authenticated world or public map');
});
test('BR96 strict loopback server serves separate street-view script and PC toggle without weakening CSP',async()=>{
 const host=createBrSquadServer({port:0,autoTick:false});
 const addr=await host.listen(),base='http://127.0.0.1:'+addr.port;
 try{
  const page=await fetch(base+'/');
  assert.equal(page.status,200);
  assert.match(page.headers.get('content-security-policy'),/script-src 'self'/);
  const html=await page.text();
  assert.match(html,/id="streetToggle" disabled aria-pressed="false"/);
  assert.ok(html.indexOf('/br96-street-view.js')<html.indexOf('/br96-client.js'));
  const asset=await fetch(base+'/br96-street-view.js');
  assert.equal(asset.status,200);
  assert.match(asset.headers.get('content-type'),/text\/javascript/);
  const script=await asset.text();
  assert.doesNotThrow(()=>new Function(script));
  assert.doesNotMatch(script,/fetch\(|WebSocket|XMLHttpRequest|localStorage|sessionStorage/);
  assert.equal((await fetch(base+'/br96-street-view.js?token=not-allowed')).status,400);
  const client=await fetch(base+'/br96-client.js').then(r=>r.text());
  assert.match(client,/w\.spectatorView\s*\?\{\.\.\.w\.spectatorView,id:w\.spectatorView\.playerId\}:w\.self/);
  assert.match(client,/visible:w\.visible\|\|\[\]/);
  assert.match(client,/key==='KeyP'/);
  assert.match(client,/keys\.clear\(\);sprintIntent=false;lastSprint=null;lastCrouch=null/);
  assert.doesNotMatch(client,/innerHTML\s*=/);
 }finally{await host.close();}
});
