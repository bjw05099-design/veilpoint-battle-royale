const test=require('node:test');
const assert=require('node:assert/strict');
const Presentation=require('../src/ch01-opening-presentation.js');
const Opening=require('../src/ch01-opening.js');

function element(){
 const listeners=new Map(),classes=new Set();
 return {
  hidden:false,disabled:false,focused:false,textContent:'',
  classList:{
   add(name){classes.add(name);},
   remove(name){classes.delete(name);},
   contains(name){return classes.has(name);},
   toggle(name,force){if(force===undefined? !classes.has(name):force)classes.add(name);else classes.delete(name);}
  },
  addEventListener(type,cb){const list=listeners.get(type)||[];list.push(cb);listeners.set(type,list);},
  removeEventListener(type,cb){listeners.set(type,(listeners.get(type)||[]).filter(fn=>fn!==cb));},
  dispatch(type,event={}){for(const cb of listeners.get(type)||[])cb(event);},
  click(){this.dispatch('click');},
  focus(){this.focused=true;}
 };
}
function documentFixture(){
 const show=element(),menu=element(),host=element(),next=element();
 const place=element(),speaker=element(),line=element();
 const nodes={
  chapterOpeningShow:show,menu,chapterOpening:host
 };
 const labels={
  '[data-opening-next]':next,
  '[data-opening-place]':place,
  '[data-opening-speaker]':speaker,
  '[data-opening-line]':line
 };
 host.querySelector=selector=>labels[selector]||null;
 const document={
  getElementById:id=>nodes[id]||null,
  querySelector:selector=>selector==='#chapterOpening [data-opening-next]'?next:null,
  addEventListener(type,handler){this.handlers[type]=handler;},
  handlers:{}
 };
 return {document,show,menu,host,next,place,speaker,line};
}

test('PC optional briefing is skippable with Escape, returns focus, and never gates main menu',()=>{
 const f=documentFixture();
 const ctl=Presentation.attachMenu(f.document);
 assert.equal(ctl.active(),false);
 f.show.click();
 assert.equal(ctl.active(),true);
 assert.equal(f.menu.classList.contains('hidden'),true);
 assert.equal(f.next.focused,true);
 assert.equal(f.host.hidden,false);
 assert.match(f.line.textContent,/출국 전/);
 let prevented=false;
 f.document.handlers.keydown({key:'Escape',preventDefault(){prevented=true;}});
 assert.equal(prevented,true);
 assert.equal(ctl.active(),false);
 assert.equal(f.host.hidden,true);
 assert.equal(f.menu.classList.contains('hidden'),false);
 assert.equal(f.show.focused,true);
});

test('manual next advances canonical chronology and automatically restores menu on final scene',()=>{
 const f=documentFixture(),ctl=Presentation.attachMenu(f.document);
 f.show.click();
 const first=f.line.textContent;
 f.next.click();
 assert.notEqual(f.line.textContent,first);
 assert.equal(ctl.active(),true);
 const visited=[first,f.line.textContent];
 for(let i=2;i<Opening.SCENES.length;i++){
  f.next.click();
  assert.equal(ctl.active(),true,'new CH01 scene must be shown before closing');
  assert.equal(f.speaker.textContent,Opening.SCENES[i].speaker);
  visited.push(f.line.textContent);
 }
 assert.equal(new Set(visited).size,Opening.SCENES.length,'every authored scene is visibly distinct');
 f.next.click();
 assert.equal(ctl.active(),false);
 assert.equal(f.menu.classList.contains('hidden'),false);
 assert.equal(f.show.focused,true);
 f.show.click();
 assert.equal(ctl.active(),true,'reopening starts optional preview without altering saved mission');
 ctl.close();
 assert.equal(ctl.active(),false);
});

test('no introduction elements leaves the active CH01 menu untouched',()=>{
 const f=documentFixture();
 assert.equal(Presentation.attachMenu({getElementById:()=>null}),null);
 assert.equal(f.menu.classList.contains('hidden'),false);
});
