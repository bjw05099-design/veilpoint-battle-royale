'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Eye=require('../src/aden-street-perspective.js');
const Explorer=require('../src/aden-city-explorer.js');
function fakeUI(){
 const callbacks=new Map(),controls=new Map(),ctx={fillStyle:'',strokeStyle:'',
  fillRect(){},strokeRect(){},beginPath(){},moveTo(){},lineTo(){},
  closePath(){},fill(){},stroke(){}};
 const canvas={width:1280,height:720,clientWidth:1280,clientHeight:720,getContext:()=>ctx};
 const doc={hidden:false,getElementById(id){
   if(id==='terrainCanvas')return canvas;
   if(!controls.has(id))controls.set(id,{textContent:'',hidden:false,
    addEventListener(){},setAttribute(k,v){this[k]=v}});
   return controls.get(id);
 },addEventListener(){}};
 const original=global.window;
 global.window={addEventListener(k,fn){callbacks.set(k,fn)},
  requestAnimationFrame(){return 1},cancelAnimationFrame(){}};
 return {doc,callbacks,dispose(){if(original===undefined)delete global.window;
  else global.window=original;}};
}
test('physically pitched software camera projects original terrain below or above the 1st-person horizon',()=>{
 const eye={x:0,y:1.65,z:0},ground={x:0,y:1.65,z:-10};
 const flat=Eye.project(eye,0,ground,1280,720),up=Eye.project(eye,0,ground,1280,720,Eye.FAR,.3),
  down=Eye.project(eye,0,ground,1280,720,Eye.FAR,-.3);
 assert.equal(flat.x,640);assert.equal(flat.y,360);
 assert.ok(up.y>360&&down.y<360);
 assert.equal(Eye.project(eye,0,ground,1280,720,Eye.FAR,Infinity),null);
 assert.equal(Eye.project(eye,0,ground,1280,720,Eye.FAR,1.5),null);
 assert.throws(()=>Eye.draw({getContext(){return {}}},new Map(),new Map(),
   {x:0,y:1,z:0},0,[],NaN),/Invalid civilian street camera/);
});
test('real PC street-eye arrow keys rotate view without walking, panning the map or scrolling the page',()=>{
 const ui=fakeUI();
 try{
  const app=Explorer.attach(ui.doc),key=ui.callbacks.get('keydown');
  function press(name,tag='DIV'){
   const e={key:name,target:{tagName:tag},preventDefault(){this.prevented=true}};
   key(e);return e;
  }
  const initial=app.getState();
  press('ArrowRight');
  assert.equal(app.getState().x,initial.x+128,'outside eye mode arrows still pan the map');
  app.action('reset');
  assert.equal(app.toggleWalking(),true);
  assert.equal(app.toggleStreetPerspective(),true);
  const start=app.getWalk();
  const before=app.getState(),angles=app.getStreetLook();
  assert.equal(press('ArrowUp').prevented,true);
  assert.ok(app.getStreetLook().pitch>angles.pitch);
  assert.equal(press('ArrowLeft').prevented,true);
  assert.ok(app.getStreetLook().yaw<angles.yaw);
  assert.equal(app.getState().x,before.x);
  assert.equal(app.getState().z,before.z);
  assert.deepEqual(app.getWalk(),start,'view controls must not move 60Hz avatar');
  const held=app.getStreetLook();
  press('ArrowDown','INPUT');
  assert.deepEqual(app.getStreetLook(),held,'typing in a focused control is ignored');
  assert.equal(press('ArrowDown').prevented,true);
  assert.equal(app.getStreetLook().pitch,0);
  app.toggleWalking();
  assert.equal(app.getStreetLook().pitch,0);
 }finally{ui.dispose();}
});
