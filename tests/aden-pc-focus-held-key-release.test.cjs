'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Explorer=require('../src/aden-city-explorer.js');

function rig(){
 const original=global.window,events=new Map(),controls=new Map();
 const documentEvents=new Map(),frames=new Map(),cancelled=[];
 const context={fillRect(){},strokeRect(){},beginPath(){},moveTo(){},
   lineTo(){},closePath(){},fill(){},stroke(){}};
 const canvas={width:1280,height:720,clientWidth:1280,clientHeight:720,
   getContext(){return context}};
 const status={textContent:''};
 const doc={hidden:false,
  addEventListener(type,fn){documentEvents.set(type,fn);},
  getElementById(id){
   if(id==='terrainCanvas')return canvas;
   if(id==='tileStatus')return status;
   if(!controls.has(id))controls.set(id,{attributes:{},
    addEventListener(){},setAttribute(key,value){this.attributes[key]=value;}});
   return controls.get(id);
  }
 };
 let id=0;
 global.window={addEventListener(type,fn){events.set(type,fn);},
  requestAnimationFrame(fn){const n=++id;frames.set(n,fn);return n;},
  cancelAnimationFrame(n){frames.delete(n);cancelled.push(n);}};
 const app=Explorer.attach(doc);
 function key(type,key,target={tagName:'DIV'}){
  const e={key,target,preventDefault(){this.prevented=true}};
  events.get(type)(e);return e;
 }
 function frameAt(time){
  const first=frames.keys().next().value;
  assert.ok(first,'there must be a scheduled walking frame');
  const fn=frames.get(first);frames.delete(first);fn(time);
 }
 return {app,doc,events,documentEvents,frames,cancelled,key,frameAt,
  dispose(){if(original===undefined)delete global.window;else global.window=original}};
}
test('actual city PC loop clears held WASD when a text control gains focus without keyup',()=>{
 const h=rig();
 try{
  assert.equal(h.key('keydown','p').prevented,true);
  assert.ok(h.app.getWalk());
  h.key('keydown','d');
  h.frameAt(1000);
  h.frameAt(1034);
  const advanced=h.app.getWalk();
  assert.ok(advanced.x>0&&advanced.tick>0,'the real fixed-step input moved');
  h.documentEvents.get('focusin')({target:{tagName:'INPUT'}});
  assert.equal(h.frames.size,0,'focused form cancels the queued RAF immediately');
  assert.ok(h.cancelled.length>0,'focus must actually cancel the stale frame ID');
  assert.equal(h.app.getWalk(),advanced,'focus cancels the held movement lease');
  const key=h.key('keydown','p',{tagName:'TEXTAREA'});
  assert.equal(key.prevented,undefined);
  assert.ok(h.app.getWalk(),'typing P must not change player mode');
  h.key('keydown','d',{tagName:'INPUT'});
  assert.equal(h.frames.size,0,'typing into input cannot resume movement');
  h.key('keydown','d',{tagName:'DIV'});
  assert.equal(h.frames.size,1,'new real play input gets a fresh RAF after focus');
  h.frameAt(1080);h.frameAt(1114);
  assert.ok(h.app.getWalk().x>advanced.x,
   'the character resumes movement after returning focus to the scene');
 }finally{h.dispose();}
});
test('nested accessible controls and editable hosts never invoke F/arrow/P gameplay actions',()=>{
 const h=rig();
 try{
  h.app.focusNextPublicRoom();
  h.key('keydown','p');
  const at=h.app.getState();
  const nested={tagName:'SPAN',parentElement:{tagName:'BUTTON'}};
  assert.equal(h.key('keydown','ArrowRight',nested).prevented,undefined);
  assert.equal(h.app.getState(),at,'focused button prevents background map panning');
  const role={tagName:'DIV',getAttribute(k){return k==='role'?'textbox':null;}};
  h.key('keydown','p',role);
  assert.ok(h.app.getWalk(),'an ARIA text box cannot turn walking off');
  h.key('keydown','f',{tagName:'SPAN',parentElement:{tagName:'DIV',isContentEditable:true}});
  assert.equal(h.app.getClosedDoors().length,0,
   'typing F inside nested editable content never closes a door');
  h.key('keydown','p',{tagName:'A',href:'terrain.html'});
  assert.ok(h.app.getWalk(),'a focused link keeps its native keyboard behavior');
 }finally{h.dispose();}
});
test('a hidden PC document suppresses an active 60Hz movement lease',()=>{
 const h=rig();
 try{
  h.key('keydown','p');h.key('keydown','w');
  h.frameAt(1000);h.frameAt(1034);
  const before=h.app.getWalk();
  h.doc.hidden=true;
  h.documentEvents.get('visibilitychange')();
  assert.equal(h.app.getWalk(),before);
  assert.equal(h.frames.size,0,'hidden document immediately cancels pending frames');
  assert.ok(h.cancelled.length>0);
  assert.equal(h.key('keydown','w').prevented,undefined,
   'hidden-tab key events cannot manipulate the moving civilian walker');
  assert.equal(h.frames.size,0);
  h.doc.hidden=false;
  h.key('keydown','w');h.frameAt(1068);h.frameAt(1102);
  assert.ok(h.app.getWalk().tick>before.tick,'visible tab schedules a fresh 60Hz loop');
 }finally{h.dispose();}
});
