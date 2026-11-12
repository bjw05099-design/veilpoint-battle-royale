'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Playback=require('../src/ch01-opening-playback.js');
const Presentation=require('../src/ch01-opening-presentation.js');
test('optional predeparture briefing can revisit an earlier factual scene without changing V1 save state',()=>{
 const untouched=Playback.initial(),arrival=Playback.skip(untouched),now={...arrival,ticks:120};
 const back=Playback.previous(now);
 assert.deepEqual(back,untouched);
 assert.equal(Playback.current(back).id,'briefed-in-korea');
 assert.deepEqual(Playback.previous(untouched),untouched);
 const escalated=Playback.skip(arrival);
 assert.equal(Playback.current(Playback.previous(escalated)).id,'arrival');
 const finished=Playback.forCheckpoint({phase:'records'},arrival);
 assert.deepEqual(Playback.previous(finished),finished,'no old checkpoint briefing replay');
 assert.deepEqual(Presentation.previous(now).state,untouched);
 assert.deepEqual(now,{version:1,scene:1,ticks:120,finished:false});
});
function fixture(){
 const old=global.window,callbacks=new Map(),frames=new Map(),nodes=new Map();
 let counter=0;
 function el(){
  const listeners=new Map(),classes=new Set();
  return {hidden:false,textContent:'',focusCount:0,
   classList:{add:k=>classes.add(k),remove:k=>classes.delete(k),
    toggle:(k,on)=>on?classes.add(k):classes.delete(k)},
   addEventListener:(k,fn)=>listeners.set(k,fn),
   removeEventListener:(k,fn)=>{if(listeners.get(k)===fn)listeners.delete(k)},
   click(){listeners.get('click')?.()},
   focus(){this.focusCount++},setAttribute(){}};
 }
 const show=el(),menu=el(),host=el(),next=el(),place=el(),speaker=el(),line=el(),pause=el();
 Object.assign(nodes,{});
 const fields={'[data-opening-next]':next,'[data-opening-place]':place,
  '[data-opening-speaker]':speaker,'[data-opening-line]':line,
  '[data-opening-pause-state]':pause};
 host.querySelector=k=>fields[k]||null;
 const doc={hidden:false,getElementById:id=>({chapterOpeningShow:show,menu,chapterOpening:host})[id],
  addEventListener:(k,fn)=>callbacks.set(k,fn)};
 global.window={requestAnimationFrame(fn){const n=++counter;frames.set(n,fn);return n;},
  cancelAnimationFrame(id){frames.delete(id)}};
 const app=Presentation.attachMenu(doc);
 return {app,show,next,line,callbacks,frames,dispose(){app.close();
  if(old===undefined)delete global.window;else global.window=old;}};
}
test('Backspace from real PC opening rewinds exactly one caption, preserving pause and menu focus isolation',()=>{
 const t=fixture();
 try{
  t.show.click();
  const initial=t.line.textContent;
  t.next.click();
  assert.notEqual(t.line.textContent,initial);
  t.callbacks.get('keydown')({key:'p',preventDefault(){},stopPropagation(){}});
  assert.equal(t.app.paused(),true);
  let prevented=0,stopped=0;
  t.callbacks.get('keydown')({key:'Backspace',preventDefault(){prevented++},
   stopPropagation(){stopped++}});
  assert.equal(prevented,1);assert.equal(stopped,1);
  assert.equal(t.line.textContent,initial);
  assert.equal(t.app.paused(),true);
  assert.equal(t.frames.size,0,'paused preview must not schedule time advancement');
  t.callbacks.get('keydown')({key:'Backspace',repeat:true,
   preventDefault(){prevented++},stopPropagation(){stopped++}});
  assert.equal(prevented,1,'key repeat never skips multiple scenes');
  t.callbacks.get('keydown')({key:'Escape',preventDefault(){},stopPropagation(){}});
  assert.equal(t.app.active(),false);
  assert.equal(t.show.focusCount,1);
 }finally{t.dispose();}
});
