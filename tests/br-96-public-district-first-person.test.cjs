'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Sim=require('../src/simulation.js');
const Street=require('../src/br96-street-view.js');
const {createBrSquadServer}=require('../server/br-squad-server.cjs');
const token=i=>i.toString(16).padStart(64,'0');

test('four real shared district pavement footprints project to walkable ground before any walls',()=>{
 const surface=Sim.PUBLIC_CITY_PAVEMENTS;
 assert.equal(surface.length,4);
 const here=surface[0],subject={id:1,x:here.x,z:here.z+8};
 const flat=Street.civicGroundPolygons(subject,0,0,surface,800,480,1.65);
 assert.ok(flat.some(x=>x.id===here.id),'public district should draw from the actual coordinate');
 for(const patch of flat)for(const point of patch.points)
  assert.ok(Number.isFinite(point.x)&&Number.isFinite(point.y));
 const pitched=Street.civicGroundPolygons(subject,0,.2,surface,800,480,1.65);
 assert.notDeepEqual(pitched,flat,'player-local vertical view changes the perspective');
 const subjectSnapshot=JSON.stringify(subject),surfacesSnapshot=JSON.stringify(surface);
 const seen=Street.frame({subject,yaw:0,pitch:.2,obstacles:[],squad:[],visible:[]});
 assert.equal(seen.seen.length,0);
 assert.equal(JSON.stringify(subject),subjectSnapshot);
 assert.equal(JSON.stringify(surface),surfacesSnapshot);
});

test('near-plane ground clips without invalid coordinates or wall-depth changes',()=>{
 const street=Sim.PUBLIC_CITY_PAVEMENTS;
 const subject={id:1,x:street[2].x,z:street[2].z};
 const polygons=Street.civicGroundPolygons(subject,1.4,0,street,960,540,1.65);
 assert.ok(polygons.length>=1);
 assert.ok(polygons.every(x=>x.points.length>=3));
 for(const patch of polygons)for(const point of patch.points){
  assert.ok(Number.isFinite(point.x)&&Number.isFinite(point.y));
  assert.ok(point.y>=540*.52);
 }
 assert.throws(()=>Street.civicGroundPolygons(subject,0,0,
  [{x:1,z:2,w:NaN,d:2,canvas:'#778899'}],960,540,1.65),
  /invalid_public_pavement/);
});

test('ground painter is part of first-person scene and cannot create remote rival',()=>{
 const patch=Sim.PUBLIC_CITY_PAVEMENTS[0];
 const rects=[],paths=[],colors=[];
 const ctx={
  set fillStyle(value){colors.push(value);},
  set globalAlpha(_value){},set strokeStyle(_value){},
  set lineWidth(_value){},set font(_value){},
  fillRect(...args){rects.push(args);},
  beginPath(){paths.push('begin');},moveTo(){},lineTo(){},closePath(){},fill(){paths.push('fill');},
  stroke(){},fillText(){}
 };
 const model=Street.draw(ctx,{width:700,height:480,
  subject:{id:1,x:patch.x,z:patch.z+7},yaw:0,pitch:0,
  obstacles:[],squad:[],visible:[],pavements:Sim.PUBLIC_CITY_PAVEMENTS});
 assert.equal(model.seen.length,0);
 assert.ok(colors.includes(patch.canvas),'ground is drawn as its own authored surface');
 assert.ok(paths.includes('fill'));
 assert.ok(rects.length>2);
});

test('authenticated public geometry contains precisely the shared original pavements',async()=>{
 const server=createBrSquadServer({port:0,autoTick:false});
 const address=await server.listen(),base='http://127.0.0.1:'+address.port;
 const post=async(path,body,auth)=>{
  const resp=await fetch(base+path,{method:'POST',headers:{
   'content-type':'application/json',...(auth?{'x-player-token':auth}:{})},
   body:JSON.stringify(body)});
  return {status:resp.status,data:await resp.json()};
 };
 try{
  const sessions=[];
  for(let i=0;i<96;i++){
   const joined=await post('/join',{name:'Player '+i});
   assert.equal(joined.status,201);sessions.push(joined.data.token);
  }
  for(const key of sessions)assert.equal((await post('/ready',{ready:true},key)).status,200);
  const deny=await fetch(base+'/world-geometry');
  assert.equal(deny.status,401);
  const response=await fetch(base+'/world-geometry',{headers:{'x-player-token':sessions[0]}});
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.schema,'veilpoint-br96-public-geometry-v1');
  assert.deepEqual(body.pavements,
   Sim.PUBLIC_CITY_PAVEMENTS.map(p=>({id:p.id,x:p.x,z:p.z,w:p.w,d:p.d,canvas:p.canvas})));
  assert.equal(JSON.stringify(body).includes(sessions[0]),false);
  assert.ok(!('actors' in body)&&!('players' in body));
 }finally{await server.close();}
});
