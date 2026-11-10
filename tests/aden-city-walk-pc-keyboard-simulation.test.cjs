'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Explorer=require('../src/aden-city-explorer.js');
const Walk=require('../src/aden-city-walking-probe.js');
function fakeUI(){
 const callbacks=new Map(),events=new Map(),controls=new Map(),status={textContent:''};
 const ctx={fillStyle:'',strokeStyle:'',lineWidth:1,fillRect(){},strokeRect(){},
  beginPath(){},moveTo(){},lineTo(){},closePath(){},fill(){},stroke(){}};
 const canvas={width:1280,height:720,clientWidth:1280,clientHeight:720,
  getContext:()=>ctx};
 const doc={getElementById(id){
  if(id==='terrainCanvas')return canvas;
  if(id==='tileStatus')return status;
  if(!controls.has(id))controls.set(id,{
   hidden:false,textContent:'',attributes:{},
   addEventListener(kind,fn){events.set(id+':'+kind,fn)},
   setAttribute(name,value){this.attributes[name]=value}});
  return controls.get(id);
 }};
 const original=global.window;
 let nextId=0;
 global.window={
  addEventListener(kind,fn){callbacks.set(kind,fn)},
  requestAnimationFrame(){return ++nextId},
  cancelAnimationFrame(){return true}
 };
 return {doc,callbacks,events,controls,status,dispose(){
  if(original===undefined)delete global.window;else global.window=original;
 }};
}
test('PC walk probe takes WASD without altering arrows, and is cancelled on map source replacement',()=>{
 const ui=fakeUI();
 try{
  const app=Explorer.attach(ui.doc),initial=app.getState();
  const key=ui.callbacks.get('keydown');
  function down(k,tag='DIV'){
   const e={key:k,target:{tagName:tag},preventDefault(){this.prevented=true}};
   key(e);return e;
  }
  assert.equal(down('p').prevented,true);
  assert.equal(app.getWalk().tick,0);
  assert.equal(ui.controls.get('walkProbe').attributes['aria-pressed'],'true');
  assert.equal(down('w').prevented,true);
  assert.equal(app.getState().z,initial.z,'physical ticks, not key repeats, move the walker');
  assert.equal(app.walkStep({south:-1},60),true);
  assert.equal(app.getWalk().tick,60);
  assert.ok(app.getWalk().z<initial.z);
  const before=app.getState();
  down('ArrowRight');
  assert.equal(app.getState().x,before.x+128,'arrow keys pan the observer');
  assert.equal(app.getWalk().x,before.x,'camera panning is not a player teleport');
  down('p','INPUT');
  assert.ok(app.getWalk(),'typing inside a file input cannot change walk mode');
  const file={format:'veilpoint-heightfield-v1',
   coordinateSystem:'local-metre-unreferenced',title:'Unreviewed local height',
   tiles:[{tx:0,tz:0,gridSize:17,source:Explorer.SOURCE,
    samples:Array(289).fill(30)}]};
  app.loadDataset(file);
  assert.equal(app.getWalk(),null,'new sources cancel old collision bodies');
  assert.equal(app.toggleWalking(),false,'only authored sample has collisions');
  app.resetSample();
  assert.equal(app.toggleWalking(),true);
  down('p');
  assert.equal(app.getWalk(),null);
  assert.equal(ui.controls.get('walkProbe').attributes['aria-pressed'],'false');
 }finally{ui.dispose();}
});
test('the experimental walking state has a fixed sixty tick rate and is not an official BR/CH01 collision authority',()=>{
 assert.equal(Walk.TICKS_PER_SECOND,60);
 assert.equal(Walk.RADIUS_METRES,.45);
 const registry=Explorer.createPreviewRegistry();
 const world={solids:[],registry:new Map(),cache:new Map(),activeKeys:new Set()};
 assert.equal(Walk.probe(world,1,1),null);
 assert.equal(registry.size,25);
});
