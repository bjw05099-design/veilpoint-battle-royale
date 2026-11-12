'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Presentation=require('../src/ch01-opening-presentation.js');
function fixture(){
 const original=global.window,handlers=new Map(),frames=new Map();
 let serial=0;
 function el(){
  const events=new Map(),classes=new Set(),attrs=new Map();
  return {hidden:false,textContent:'',focused:false,
   classList:{add(k){classes.add(k)},remove(k){classes.delete(k)},
    toggle(k,yes){if(yes)classes.add(k);else classes.delete(k)}},
   setAttribute(k,v){attrs.set(k,v)},getAttribute:k=>attrs.get(k),
   addEventListener(k,fn){events.set(k,fn)},
   removeEventListener(k,fn){if(events.get(k)===fn)events.delete(k)},
   click(){events.get('click')?.()},
   focus(){this.focused=true}};
 }
 const show=el(),menu=el(),host=el(),next=el(),place=el(),speaker=el(),line=el(),pause=el();
 const nodes={'chapterOpeningShow':show,menu,chapterOpening:host};
 host.querySelector=k=>({
  '[data-opening-next]':next,'[data-opening-place]':place,
  '[data-opening-speaker]':speaker,'[data-opening-line]':line,
  '[data-opening-pause-state]':pause})[k]||null;
 const doc={hidden:false,getElementById:k=>nodes[k]||null,
  addEventListener(k,fn){handlers.set(k,fn)}};
 global.window={requestAnimationFrame(fn){const id=++serial;frames.set(id,fn);return id;},
  cancelAnimationFrame(id){frames.delete(id)}};
 const controller=Presentation.attachMenu(doc);
 function frame(t){const [id,fn]=frames.entries().next().value;
  assert.ok(fn,'expected scheduled browser frame');frames.delete(id);fn(t);}
 function key(k,extra={}){let prevented=0,stopped=0;
  handlers.get('keydown')({key:k,preventDefault(){prevented++},
   stopPropagation(){stopped++},...extra});
  return {prevented,stopped};}
 function close(){controller.close();if(original===undefined)delete global.window;else global.window=original;}
 return {show,menu,host,next,place,speaker,line,pause,doc,frames,controller,frame,key,close};
}
test('PC story briefing pauses its real RAF 60Hz caption clock and resumes without time skips',()=>{
 const t=fixture();
 try {
  t.show.click();
  t.frame(1000);t.frame(1017);
  const initial=t.line.textContent;
  assert.match(initial,/출국 전/);
  assert.equal(t.key('p').prevented,1);
  assert.equal(t.controller.paused(),true);
  assert.equal(t.frames.size,0);
  assert.match(t.pause.textContent,/일시정지/);
  assert.equal(t.host.getAttribute('data-auto-paused'),'true');
  // A manual next remains available while the auto clock is suspended.
  t.next.click();
  assert.notEqual(t.line.textContent,initial);
  const arrival=t.line.textContent;
  assert.equal(t.frames.size,0);
  assert.equal(t.key('P',{repeat:true}).prevented,0);
  assert.equal(t.controller.paused(),true);
  assert.equal(t.key('p').prevented,1);
  assert.equal(t.controller.paused(),false);
  assert.equal(t.frames.size,1);
  t.frame(9999999); // resume discards background wall time
  assert.equal(t.line.textContent,arrival);
  for(let i=1;i<=185;i++)t.frame(9999999+i*1000/60);
  assert.notEqual(t.line.textContent,arrival,'next scene progresses only after resumed ticks');
  assert.equal(t.key('Escape').prevented,1);
  assert.equal(t.frames.size,0);
  assert.equal(t.controller.active(),false);
  assert.equal(t.show.focused,true);
 }finally{t.close();}
});
test('paused story intro stays keyboard-isolated and a fresh opening resets the pause flag',()=>{
 const t=fixture();
 try{
  t.controller.show();t.key('p');
  assert.equal(t.controller.paused(),true);
  assert.equal(t.key('Tab').prevented,1);
  assert.equal(t.next.focused,true);
  t.controller.close();
  assert.equal(t.controller.paused(),false);
  t.controller.show();
  assert.equal(t.controller.paused(),false);
  assert.equal(t.frames.size,1);
  assert.equal(t.host.getAttribute('data-auto-paused'),'false');
 }finally{t.close();}
});
