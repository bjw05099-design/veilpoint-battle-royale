'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Presentation=require('../src/ch01-opening-presentation.js');
const Playback=require('../src/ch01-opening-playback.js');
const Opening=require('../src/ch01-opening.js');

function fixture(){
 const old=global.window,callbacks=new Map(),frames=new Map(),cancelled=[];
 let nextFrame=0;
 function el(){
  const listeners=new Map(),classes=new Set();
  return {hidden:false,textContent:'',focused:false,
   classList:{add(k){classes.add(k)},remove(k){classes.delete(k)},
    contains(k){return classes.has(k)},
    toggle(k,yes){if(yes)classes.add(k);else classes.delete(k)}},
   addEventListener(k,fn){listeners.set(k,fn)},
   removeEventListener(k,fn){if(listeners.get(k)===fn)listeners.delete(k)},
   click(){listeners.get('click')?.()},
   focus(){this.focused=true}
  };
 }
 const show=el(),menu=el(),host=el(),next=el(),place=el(),speaker=el(),line=el();
 const names={chapterOpeningShow:show,menu,chapterOpening:host};
 const content={'[data-opening-next]':next,'[data-opening-place]':place,
  '[data-opening-speaker]':speaker,'[data-opening-line]':line};
 host.querySelector=k=>content[k];
 const doc={hidden:false,getElementById:k=>names[k]||null,
  addEventListener(k,fn){callbacks.set(k,fn)}};
 global.window={requestAnimationFrame(fn){const id=++nextFrame;frames.set(id,fn);return id;},
  cancelAnimationFrame(id){if(frames.delete(id))cancelled.push(id);}};
 const controller=Presentation.attachMenu(doc);
 function frame(time){
  assert.ok(frames.size>0,'PC must schedule an opening frame');
  const [id,fn]=frames.entries().next().value;
  frames.delete(id);fn(time);
 }
 function close(){
  controller.close();
  if(old===undefined)delete global.window;
  else global.window=old;
 }
 return {controller,doc,show,menu,host,next,place,speaker,line,callbacks,
  frames,cancelled,frame,close};
}
test('actual PC optional predeparture caption clock advances chronologically and closes itself after 60Hz playback',()=>{
 const t=fixture();
 try{
  t.show.click();
  assert.equal(t.controller.active(),true);
  assert.ok(t.frames.size===1);
  assert.match(t.line.textContent,/출국 전/);
  const sceneCount=Opening.SCENES.length;
  assert.ok(sceneCount>=4);
  const framesNeeded=sceneCount*Playback.TICKS_PER_SCENE;
  let lastText=t.line.textContent,changes=0;
  for(let i=0;i<framesNeeded+20&&t.controller.active();i++){
   t.frame(1000+i*1000/60);
   if(t.line.textContent!==lastText){changes++;lastText=t.line.textContent;}
  }
  assert.equal(t.controller.active(),false,'finished transcript returns to the menu');
  assert.equal(t.host.hidden,true);
  assert.equal(t.menu.classList.contains('hidden'),false);
  assert.equal(t.show.focused,true,'keyboard focus returns to the opening button');
  assert.equal(t.frames.size,0,'no orphan frame after closing');
  assert.ok(changes>=3,'all story chapters were actually shown in order');
  t.show.click();
  assert.equal(t.controller.active(),true,'optional intro can replay, never a forced checkpoint');
  t.controller.close();
 }finally{t.close();}
});
test('hidden PC tab suspends caption clock without skipping ahead on resumed wall time',()=>{
 const t=fixture();
 try{
  t.controller.show();
  t.frame(1000);t.frame(1017);
  const before=t.line.textContent;
  t.doc.hidden=true;t.callbacks.get('visibilitychange')();
  assert.equal(t.frames.size,0,'no invisible background story playback');
  assert.ok(t.cancelled.length>0);
  t.doc.hidden=false;t.callbacks.get('visibilitychange')();
  t.frame(99999999);
  assert.equal(t.line.textContent,before,'hidden wall-clock gap cannot skip scenes');
  t.frame(99999999+17);
  assert.equal(t.line.textContent,before,'normal time continues after resume');
  t.next.click();
  assert.notEqual(t.line.textContent,before,'manual PC action still advances exactly one scene');
  t.controller.close();
  assert.equal(t.frames.size,0);
 }finally{t.close();}
});
test('both timed completion and manual finish notify once; destroyed intro cannot continue changing the menu',()=>{
 const t=fixture();
 try{
  let done=0;
  const mounted=Presentation.mount(t.doc,undefined,()=>done++);
  for(let i=0;i<Playback.TICKS_PER_SCENE*Opening.SCENES.length+15;i++)
   mounted.tick();
  assert.equal(mounted.snapshot().visible,false);
  assert.equal(done,1);
  mounted.advance();mounted.tick();mounted.advance();
  assert.equal(done,1);
  mounted.destroy();
  assert.equal(t.host.hidden,true);
  const hidden=Presentation.mount(t.doc,Playback.forCheckpoint({phase:'records'}),()=>done++);
  assert.equal(hidden.snapshot().visible,false);
  hidden.tick();hidden.advance();
  assert.equal(done,1,'already completed older checkpoint must never re-trigger opening');
  hidden.destroy();
 }finally{t.close();}
});
