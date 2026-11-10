'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Presentation=require('../src/ch01-opening-presentation.js');
function el(){
 const listeners=new Map(),classes=new Set();
 return {hidden:false,focused:false,focusCalls:0,textContent:'',
  classList:{add:s=>classes.add(s),remove:s=>classes.delete(s),contains:s=>classes.has(s),
   toggle(s,on){if(on)classes.add(s);else classes.delete(s);}},
  addEventListener(type,fn){listeners.set(type,fn)},
  removeEventListener(type,fn){if(listeners.get(type)===fn)listeners.delete(type)},
  click(){listeners.get('click')?.()},
  focus(){this.focused=true;this.focusCalls++},
  querySelector(){return null}};
}
function harness(){
 const show=el(),menu=el(),host=el(),next=el(),place=el(),speaker=el(),line=el(),handlers={};
 const targets={'[data-opening-next]':next,'[data-opening-place]':place,
  '[data-opening-speaker]':speaker,'[data-opening-line]':line};
 host.querySelector=selector=>targets[selector]||null;
 const nodes={chapterOpeningShow:show,menu,chapterOpening:host};
 const doc={getElementById:id=>nodes[id]||null,
  addEventListener:(type,fn)=>{handlers[type]=fn}};
 return {show,menu,host,next,handlers,ctl:Presentation.attachMenu(doc)};
}
function key(fn,key,shiftKey=false){
 const e={key,shiftKey,prevented:0,stopped:0,
  preventDefault(){this.prevented++},stopPropagation(){this.stopped++}};
 fn(e);return e;
}
test('CH01 opening Tab and Shift+Tab remain on the only visible control',()=>{
 const h=harness();
 assert.equal(h.ctl.active(),false);
 let ev=key(h.handlers.keydown,'Tab');
 assert.equal(ev.prevented,0,'outside modal the native browser focus system is unchanged');
 h.show.click();
 assert.equal(h.ctl.active(),true);
 assert.equal(h.menu.classList.contains('hidden'),true);
 for(const shifted of [false,true,false]){
  const count=h.next.focusCalls;
  ev=key(h.handlers.keydown,'Tab',shifted);
  assert.equal(ev.prevented,1);
  assert.equal(ev.stopped,1);
  assert.equal(h.next.focusCalls,count+1);
  assert.equal(h.ctl.active(),true);
 }
 assert.equal(h.host.hidden,false);
 h.ctl.close();
 assert.equal(h.ctl.active(),false);
 ev=key(h.handlers.keydown,'Tab');
 assert.equal(ev.stopped,0);
 assert.equal(h.menu.classList.contains('hidden'),false);
});
test('CH01 modal Escape consumes one keyboard event and restores menu exactly once',()=>{
 const h=harness();
 h.show.click();
 assert.equal(h.ctl.active(),true);
 const ev=key(h.handlers.keydown,'Escape');
 assert.equal(ev.prevented,1);
 assert.equal(ev.stopped,1,'Escape must not reach the window gameplay handler');
 assert.equal(h.ctl.active(),false);
 assert.equal(h.host.hidden,true);
 assert.equal(h.menu.classList.contains('hidden'),false);
 assert.equal(h.show.focusCalls,1);
 const second=key(h.handlers.keydown,'Escape');
 assert.equal(second.stopped,0,'an already closed modal owns no later Escape');
 assert.equal(h.show.focusCalls,1);
 h.show.click();
 assert.equal(h.ctl.active(),true,'reopening the optional chapter briefing is still possible');
 h.ctl.close();
});
