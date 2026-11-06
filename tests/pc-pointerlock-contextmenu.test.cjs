'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

// Test the registered browser event, not merely a matching comment/string.
// This is an offline Node contract: actual Windows browser execution remains
// a separate, required acceptance step.
function contextMenu(file){
 const source=fs.readFileSync(path.resolve(__dirname,'../src',file),'utf8');
 const anchor="canvas.addEventListener('contextmenu',e=>{";
 const start=source.indexOf(anchor);
 assert.ok(start>=0,'missing context menu handler: '+file);
 const end=source.indexOf('});',start);
 assert.ok(end>start,'context menu must terminate: '+file);
 let listener=null,locked=true,playing=true,touch=false;
 const canvas={addEventListener(type,fn){assert.equal(type,'contextmenu');listener=fn;}};
 const document={get pointerLockElement(){return locked?canvas:null;}};
 const context={canvas,document,get isTouch(){return touch;},canAct(){return playing;}};
 vm.runInNewContext(source.slice(start,end+3),context,{timeout:1000});
 assert.equal(typeof listener,'function');
 return {
  setLocked(value){locked=value;},setPlaying(value){playing=value;},setTouch(value){touch=value;},
  dispatch(){
   let prevented=0;
   listener({preventDefault(){prevented++;}});
   return prevented;
  }
 };
}

for(const file of ['app.js','story-app.js']){
 test(file+' blocks browser right-click menu only while desktop camera is playable and locked',()=>{
  const c=contextMenu(file);
  assert.equal(c.dispatch(),1,'active locked PC camera must retain mouse focus');
  c.setLocked(false);
  assert.equal(c.dispatch(),0,'unlocked desktop canvas keeps ordinary browser menu');
  c.setLocked(true);c.setPlaying(false);
  assert.equal(c.dispatch(),0,'paused/terminal scenes preserve browser menu');
  c.setPlaying(true);c.setTouch(true);
  assert.equal(c.dispatch(),0,'touch context menus are unaffected');
  c.setTouch(false);
  assert.equal(c.dispatch(),1,'an explicit playable resume restores camera context protection');
 });
}

test('PC contextmenu guard cannot unpause, move, or fire a simulated world',()=>{
 for(const file of ['app.js','story-app.js']){
  const source=fs.readFileSync(path.resolve(__dirname,'../src',file),'utf8');
  const start=source.indexOf("canvas.addEventListener('contextmenu',e=>{");
  const end=source.indexOf('});',start);
  const handler=source.slice(start,end+3);
  assert.doesNotMatch(handler,/Story\.step|Game\.tick|fire\(|resume\(|persist\(|running\s*=/);
  assert.match(handler,/document\.pointerLockElement===canvas/);
  assert.match(handler,/canAct\(\)/);
 }
});
