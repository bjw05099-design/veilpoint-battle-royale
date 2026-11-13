'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Explorer=require('../src/aden-city-explorer.js');
const Eye=require('../src/aden-street-perspective.js');
const Walk=require('../src/aden-city-walking-probe.js');
const Districts=require('../src/aden-preview-districts.js');
function ui(){
 const keys=new Map(),nodes=new Map();let frame;
 const ctx={fillRect(){},strokeRect(){},beginPath(){},moveTo(){},lineTo(){},
  closePath(){},fill(){},stroke(){}};
 const canvas={width:960,height:600,clientWidth:960,clientHeight:600,getContext:()=>ctx};
 const doc={hidden:false,addEventListener(){},getElementById(id){
  if(id==='terrainCanvas')return canvas;
  if(!nodes.has(id))nodes.set(id,{addEventListener(){},setAttribute(){}});
  return nodes.get(id);
 }};
 const previous=global.window;
 global.window={addEventListener(name,fn){keys.set(name,fn)},
  requestAnimationFrame(fn){frame=fn;return 1},cancelAnimationFrame(){frame=null}};
 const app=Explorer.attach(doc);
 return {app,canvas,ctx,key(key,type='keydown'){keys.get(type)({key,target:{tagName:'DIV'},preventDefault(){}})},
  frame(time){assert.ok(frame);const run=frame;frame=null;run(time)},
  close(){if(previous===undefined)delete global.window;else global.window=previous}};
}
test('real street-view W follows camera yaw, diagonal speed stays bounded, overhead W stays north',()=>{
 const h=ui();
 try{
  assert.equal(h.app.toggleWalking(),true);
  assert.equal(h.app.toggleStreetPerspective(),true);
  for(let n=0;n<13;n++)h.key('ArrowRight'); // 1.56 rad, almost east
  const start=h.app.getWalk();
  h.key('w');h.frame(0);h.frame(17);
  const forward=h.app.getWalk();
  assert.ok(forward.x-start.x>.027,'W must follow the visible east-facing street');
  assert.ok(Math.abs(forward.z-start.z)<.001);
  h.key('d');h.frame(34);
  const diagonal=h.app.getWalk();
  assert.ok(Math.abs(Math.hypot(diagonal.x-forward.x,diagonal.z-forward.z)-
    Walk.SPEED_METRES_PER_SECOND/60)<1e-7,'diagonal input cannot increase physical walking speed');
  h.key('d','keyup');h.key('w','keyup');
  h.app.toggleStreetPerspective();
  const before=h.app.getWalk();h.key('w');h.frame(100);h.frame(117);
  const north=h.app.getWalk();
  assert.ok(north.z<before.z);assert.ok(Math.abs(north.x-before.x)<1e-9);
 }finally{h.close()}
});
test('eye-level public doorway opening agrees with the real walking collider in both F states',()=>{
 const registry=Explorer.createPreviewRegistry(),cache=new Map(),h=ui();
 try{
  Explorer.draw(h.canvas,registry,Explorer.viewState(),cache);
  const room=Districts.PUBLIC_INTERIORS[0],b=Districts.PLAN.buildings.find(b=>b.id===room.id);
  const foundation=Districts.buildingFoundation(b,registry,cache,new Set(cache.keys()));
  assert.ok(foundation);
  const threshold={x:b.x,z:b.z+b.d/2};
  const blockedPanel=panels=>panels.some(p=>p.vertices.every(v=>v[2]===threshold.z)&&
   Math.min(...p.vertices.map(v=>v[0]))<threshold.x&&
   Math.max(...p.vertices.map(v=>v[0]))>threshold.x&&
   Math.min(...p.vertices.map(v=>v[1]))<foundation.baseMetres+1.65&&
   Math.max(...p.vertices.map(v=>v[1]))>foundation.baseMetres+1.65);
  for(const closed of [false,true]){
   const doors=new Set(closed?[room.id]:[]);
   const world=Walk.createWorld(registry,cache,new Set(cache.keys()),[b],doors);
   assert.equal(!!Walk.probe(world,threshold.x,threshold.z),!closed);
   assert.equal(blockedPanel(Eye.facadePanels(b,foundation,room,closed)),closed,
    'an open physical threshold must not be painted as a closed wall');
  }
  assert.equal(blockedPanel(Eye.facadePanels(b,foundation,null)),true,
   'a room not registered in the physical world cannot create a new visible entrance');
 }finally{h.close()}
});
test('the actual grounded civilian body is painted at eye level without mutating it or inventing people',()=>{
 const registry=Explorer.createPreviewRegistry(),cache=new Map(),h=ui();
 try{
  Explorer.draw(h.canvas,registry,Explorer.viewState(),cache);
  const world=Walk.createWorld(registry,cache,new Set(cache.keys()),[]);
  const viewer=Walk.initial(world,0,0),person=Walk.initial(world,0,-4);
  const before=JSON.stringify(person),colors=[];
  h.ctx.fill=function(){colors.push(this.fillStyle)};
  const view=Eye.draw(h.canvas,registry,cache,viewer,0,[],0,{pedestrians:[person]});
  assert.equal(view.civilianBodies,1);
  assert.ok(colors.includes('#73958b'),'the physical person must have a drawn body');
  assert.equal(JSON.stringify(person),before);
  assert.equal(Eye.draw(h.canvas,registry,cache,viewer,0).civilianBodies,0);
 }finally{h.close()}
});
