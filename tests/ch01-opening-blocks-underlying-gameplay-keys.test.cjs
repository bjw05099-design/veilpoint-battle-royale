'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Presentation=require('../src/ch01-opening-presentation.js');

function element(){
 const handlers=new Map(),names=new Set();
 return {hidden:false,textContent:'',focused:false,
  classList:{add:k=>names.add(k),remove:k=>names.delete(k),
   toggle(k,on){if(on)names.add(k);else names.delete(k)}},
  addEventListener:(k,fn)=>handlers.set(k,fn),
  removeEventListener:(k,fn)=>{if(handlers.get(k)===fn)handlers.delete(k)},
  click(){handlers.get('click')?.()},
  focus(){this.focused=true}
 };
}
function fixture(){
 const menu=element(),show=element(),host=element(),next=element();
 const place=element(),speaker=element(),line=element(),events=[];
 const labels={'[data-opening-next]':next,'[data-opening-place]':place,
  '[data-opening-speaker]':speaker,'[data-opening-line]':line};
 host.querySelector=selector=>labels[selector]||null;
 const nodes={chapterOpeningShow:show,menu,chapterOpening:host};
 const doc={getElementById:id=>nodes[id]||null,
  addEventListener(type,fn,capture){events.push({type,fn,capture})}};
 const control=Presentation.attachMenu(doc);
 const key=events.find(x=>x.type==='keydown');
 function dispatch(keyName,target=next){
  const event={key:keyName,target,prevented:0,stopped:0,
   preventDefault(){this.prevented++},stopPropagation(){this.stopped++}};
  key.fn(event);
  return event;
 }
 return {control,show,host,next,line,key,dispatch};
}
test('predeparture CH01 modal captures gameplay movement and F interaction before the live document listener',()=>{
 const f=fixture();
 assert.equal(f.key.capture,true,'document capture must run before previously mounted game handlers');
 assert.equal(f.dispatch('f').prevented,0,'closed dialog cannot affect normal game input');
 f.show.click();
 const first=f.line.textContent;
 for(const key of ['w','a','s','d','f','e','m','ArrowUp','Shift','g']){
  const event=f.dispatch(key);
  assert.equal(event.prevented,1,key+' cannot reach live controls');
  assert.equal(event.stopped,1);
  assert.equal(f.line.textContent,first,'no gameplay key may advance caption playback');
 }
 const outside=f.dispatch('Enter',f.host);
 assert.equal(outside.prevented,1,'Enter outside Next must not activate hidden controls');
 const enter=f.dispatch('Enter',f.next);
 const space=f.dispatch(' ',f.next);
 assert.equal(enter.prevented,0,'focused Next retains native keyboard activation');
 assert.equal(space.prevented,0,'Space on focused Next remains accessible');
 f.next.click();
 assert.notEqual(f.line.textContent,first,'actual Next action still advances one authored scene');
 f.control.close();
 assert.equal(f.dispatch('f').prevented,0,'closing restores ordinary gameplay input');
});
