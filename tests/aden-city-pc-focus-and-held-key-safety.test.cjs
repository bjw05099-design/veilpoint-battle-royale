'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Explorer=require('../src/aden-city-explorer.js');
function keyboardRig(){
 const windowHandlers=new Map(),docHandlers=new Map(),scheduled=new Map(),controls=new Map();
 let index=0;
 const canvas={width:1280,height:720,clientWidth:1280,clientHeight:720,
  getContext:()=>({fillRect(){},strokeRect(){},beginPath(){},moveTo(){},
   lineTo(){},closePath(){},fill(){},stroke(){}})};
 const doc={hidden:false,addEventListener(type,fn){docHandlers.set(type,fn)},
  getElementById(id){
   if(id==='terrainCanvas')return canvas;
   if(id==='tileStatus')return {textContent:''};
   if(!controls.has(id))controls.set(id,{addEventListener(){},setAttribute(){},hidden:false});
   return controls.get(id);
  }};
 const saved=global.window;
 global.window={addEventListener(type,fn){windowHandlers.set(type,fn)},
  requestAnimationFrame(fn){const id=++index;scheduled.set(id,fn);return id},
  cancelAnimationFrame(id){scheduled.delete(id)}};
 return {doc,windowHandlers,docHandlers,scheduled,
  key(key,target={tagName:'DIV'}){const e={key,target,repeat:false,
   preventDefault(){this.prevented=true}};
   windowHandlers.get('keydown')(e);return e},
  pulse(ms){const events=[...scheduled.values()];scheduled.clear();for(const fn of events)fn(ms)},
  close(){if(saved===undefined)delete global.window;else global.window=saved}};
}
test('nested PC controls own P/F/WASD without stealing city walking or camera commands',()=>{
 const ui=keyboardRig();
 try{
  const app=Explorer.attach(ui.doc);
  assert.equal(ui.key('p').prevented,true);
  assert.ok(app.getWalk());
  const old=app.getState(),oldTick=app.getWalk().tick;
  const nested={tagName:'SPAN',parentElement:{tagName:'BUTTON'}};
  for(const key of ['p','f','w','ArrowRight']){
   const event=ui.key(key,nested);
   assert.equal(event.prevented,undefined);
  }
  assert.equal(app.getWalk().tick,oldTick);
  assert.deepEqual([app.getState().x,app.getState().z],[old.x,old.z]);
  assert.equal(ui.scheduled.size,0);
  for(const target of [
   {tagName:'DIV',role:'textbox'},
   {tagName:'DIV',isContentEditable:true},
   {tagName:'SPAN',parentNode:{tagName:'TEXTAREA'}},
   {tagName:'A',href:'index.html'}
  ])assert.equal(ui.key('w',target).prevented,undefined);
  assert.equal(ui.scheduled.size,0);
 }finally{ui.close();}
});
test('focus transfer or hidden-tab event releases held walking intent and prevents phantom 60Hz steps',()=>{
 const ui=keyboardRig();
 try{
  const app=Explorer.attach(ui.doc);ui.key('p');
  const start=app.getWalk();
  ui.key('w');
  assert.ok(ui.scheduled.size>0);
  ui.docHandlers.get('focusin')({target:{tagName:'SPAN',parentElement:{tagName:'INPUT'}}});
  ui.pulse(1000);ui.pulse(1030);
  assert.equal(app.getWalk().tick,start.tick);
  ui.key('w');
  ui.pulse(2000);ui.pulse(2020);
  const walking=app.getWalk();
  assert.ok(walking.tick>start.tick,'normal WASD still advances physical 60Hz simulation');
  ui.doc.hidden=true;
  ui.docHandlers.get('visibilitychange')();
  ui.pulse(2050);ui.pulse(2070);
  assert.equal(app.getWalk().tick,walking.tick);
  assert.equal(app.getWalk().z,walking.z);
  ui.doc.hidden=false;
  ui.key('w');
  ui.pulse(3000);ui.pulse(3020);
  assert.ok(app.getWalk().tick>walking.tick,'returning to map accepts new deliberate keydown');
 }finally{ui.close();}
});
test('malformed ancestry cannot loop indefinitely or turn a game canvas into an editable PC control',()=>{
 const cycle={tagName:'SPAN'};cycle.parentNode=cycle;
 assert.equal(Explorer.interactiveKeyTarget(cycle),false);
 assert.equal(Explorer.interactiveKeyTarget({tagName:'CANVAS'}),false);
 assert.equal(Explorer.interactiveKeyTarget({tagName:'SPAN',parentNode:{
  tagName:'DIV',getAttribute(name){return name==='role'?'combobox':null}
 }}),true);
});
