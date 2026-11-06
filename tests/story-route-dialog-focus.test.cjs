'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../src/story-app.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'../story.html'),'utf8');
const start=source.indexOf('  function routeDialogControls(){');
const end=source.indexOf('  function showChoices(){',start);
assert.ok(start>0&&end>start,'route choice focus logic must be present');
function fixture(){
 const handlers={};const nodes={};
 const document={
  activeElement:null,
  addEventListener(type,handler,capture){
   assert.equal(capture,true);
   handlers[type]=handler;
  }
 };
 const choices={
  hidden:false,classList:{contains(type){return type==='hidden'&&choices.hidden;}},
  contains(target){return Object.values(nodes).includes(target);}
 };
 for(const id of ['choiceEvac','choiceVerified','choiceBack']){
  nodes[id]={id,disabled:false,focus(){document.activeElement=this;},
   getClientRects(){return [{}];}};
 }
 const context={document,choices,$:id=>nodes[id]};
 vm.runInNewContext(source.slice(start,end),context,{timeout:1000});
 function tab(id,{shift=false}={}){
  document.activeElement=nodes[id]||{id};
  let prevented=0;
  handlers.keydown({type:'keydown',key:'Tab',shiftKey:shift,
   preventDefault(){prevented++;}});
  return prevented;
 }
 return {handlers,nodes,document,choices,tab};
}
test('CH01 route choices wrap Tab and Shift+Tab without focusing background controls',()=>{
 const f=fixture();
 assert.equal(f.tab('choiceBack'),1);
 assert.equal(f.document.activeElement,f.nodes.choiceEvac);
 assert.equal(f.tab('choiceEvac',{shift:true}),1);
 assert.equal(f.document.activeElement,f.nodes.choiceBack);
});
test('CH01 route dialog never tabs into an unavailable verification option',()=>{
 const f=fixture();
 f.nodes.choiceVerified.disabled=true;
 assert.equal(f.tab('choiceEvac',{shift:true}),1);
 assert.equal(f.document.activeElement,f.nodes.choiceBack);
 assert.equal(f.tab('choiceBack'),1);
 assert.equal(f.document.activeElement,f.nodes.choiceEvac);
});
test('CH01 restores focus after external UI focus and releases it after dialog closes',()=>{
 const f=fixture();
 const outside={id:'hidden-pause-button'};
 f.document.activeElement=outside;
 f.handlers.focusin({type:'focusin',target:outside});
 assert.equal(f.document.activeElement,f.nodes.choiceEvac);
 f.choices.hidden=true;
 f.document.activeElement=outside;
 assert.equal(f.tab('hidden-pause-button'),0);
 assert.equal(f.document.activeElement.id,outside.id);
 f.handlers.focusin({type:'focusin',target:outside});
 assert.equal(f.document.activeElement.id,outside.id);
});
test('CH01 keyboard focus gate does not intercept number choices or Escape',()=>{
 const f=fixture();
 f.document.activeElement=f.nodes.choiceEvac;
 for(const key of ['1','2','Escape']){
  let prevented=0;
  f.handlers.keydown({type:'keydown',key,preventDefault(){prevented++;}});
  assert.equal(prevented,0);
  assert.equal(f.document.activeElement,f.nodes.choiceEvac);
 }
 assert.match(html,/<section id="choices"[^>]*role="dialog" aria-modal="true"/);
 assert.match(source,/document\.addEventListener\('keydown',containRouteDialogFocus,true\)/);
});

test('CH01 route arrow keys skip unavailable choices and wrap without activating a route',()=>{
 const f=fixture();
 f.nodes.choiceVerified.disabled=true;
 f.document.activeElement=f.nodes.choiceEvac;
 let prevented=0;
 for(const [key,expected] of [
  ['ArrowRight','choiceBack'],
  ['ArrowDown','choiceEvac'],
  ['ArrowLeft','choiceBack'],
  ['ArrowUp','choiceEvac']]){
  f.handlers.keydown({type:'keydown',key,preventDefault(){prevented++;}});
  assert.equal(f.document.activeElement,f.nodes[expected],
   key+' must move to a visible enabled choice');
 }
 assert.equal(prevented,4,'all arrow movement stays inside the route dialog');
 assert.equal(f.nodes.choiceVerified.disabled,true,'locked route is never enabled implicitly');
});

test('CH01 route redirects focus from a disabled choice instead of accepting background focus',()=>{
 const f=fixture();
 f.nodes.choiceVerified.disabled=true;
 f.document.activeElement=f.nodes.choiceVerified;
 f.handlers.focusin({type:'focusin',target:f.nodes.choiceVerified});
 assert.equal(f.document.activeElement,f.nodes.choiceEvac);
 f.document.activeElement=f.nodes.choiceBack;
 f.handlers.focusin({type:'focusin',target:f.nodes.choiceBack});
 assert.equal(f.document.activeElement,f.nodes.choiceBack);
});

test('CH01 arrow navigation preserves operating-system shortcuts and releases after dialog closes',()=>{
 const f=fixture();
 f.document.activeElement=f.nodes.choiceEvac;
 let prevented=0;
 f.handlers.keydown({type:'keydown',key:'ArrowRight',ctrlKey:true,
  preventDefault(){prevented++;}});
 assert.equal(prevented,0);
 assert.equal(f.document.activeElement,f.nodes.choiceEvac);
 f.choices.hidden=true;
 f.handlers.keydown({type:'keydown',key:'ArrowRight',
  preventDefault(){prevented++;}});
 assert.equal(prevented,0);
 assert.equal(f.document.activeElement,f.nodes.choiceEvac);
});
