'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../src/app.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const start=source.indexOf('function visibleGraphicsDialogControls(');
const end=source.indexOf('function setGraphicsPanelOpen(',start);
assert.ok(start>0&&end>start,'PC modal focus handler must exist');

function fixture(){
 const handlers={};
 const document={activeElement:null,addEventListener(type,handler,capture){
  assert.equal(capture,true,'focus trap must run before gameplay handlers');
  handlers[type]=handler;
 }};
 function element(id,{shown=true,disabled=false,tabIndex=0}={}){
  return {id,disabled,tabIndex,getClientRects(){return shown?[{}]:[];},
   focus(){document.activeElement=this;}};
 }
 const close=element('graphicsClose');
 const select=element('graphicsPreset');
 const hidden=element('hidden-control',{shown:false});
 const outside=element('play');
 const panel={
  hidden:false,
  classList:{contains(name){return name==='hidden'&&panel.hidden;}},
  querySelectorAll(){return [close,select,hidden];},
  contains(node){return [close,select,hidden].includes(node);}
 };
 vm.runInNewContext(source.slice(start,end),{
  document,$:id=>id==='graphicsPanel'?panel:close,
  getComputedStyle:()=>({visibility:'visible'})
 },{timeout:1000});
 function key(active,shiftKey=false,key='Tab'){
  document.activeElement=active;
  let prevented=0;
  handlers.keydown({type:'keydown',key,shiftKey,preventDefault(){prevented++;}});
  return prevented;
 }
 return {handlers,document,close,select,hidden,outside,panel,key};
}

test('graphics dialog wraps forward and backward Tab instead of reaching resume',()=>{
 const f=fixture();
 assert.equal(f.key(f.select),1);
 assert.equal(f.document.activeElement,f.close);
 assert.equal(f.key(f.close,true),1);
 assert.equal(f.document.activeElement,f.select);
});
test('Tab from outside returns into open graphics dialog, never activates background controls',()=>{
 const f=fixture();
 assert.equal(f.key(f.outside),1);
 assert.equal(f.document.activeElement,f.close);
 f.document.activeElement=f.outside;
 f.handlers.focusin({type:'focusin',target:f.outside});
 assert.equal(f.document.activeElement,f.close);
});
test('hidden or disabled controls do not become keyboard destinations; closed panel releases trap',()=>{
 const f=fixture();
 assert.equal(f.key(f.select),1);
 assert.notEqual(f.document.activeElement,f.hidden);
 f.panel.hidden=true;
 assert.equal(f.key(f.outside),0);
 assert.equal(f.document.activeElement,f.outside);
 f.panel.hidden=false;
 assert.equal(f.key(f.close,false,'Escape'),0);
 assert.equal(f.document.activeElement,f.close);
});
test('graphics settings exposes accessible modal semantics without changing game state',()=>{
 assert.match(html,/<section id="graphicsPanel"[^>]*role="dialog" aria-modal="true"/);
 assert.match(source,/document\.addEventListener\('focusin',containGraphicsDialogFocus,true\)/);
 assert.match(source,/document\.addEventListener\('keydown',containGraphicsDialogFocus,true\)/);
});

test('visible graphics dialog rejects focus on hidden and disabled tab controls',()=>{
 const f=fixture();
 f.document.activeElement=f.hidden;
 f.handlers.focusin({type:'focusin',target:f.hidden});
 assert.equal(f.document.activeElement,f.close,
  'hidden graphics-tab controls cannot keep keyboard focus');
 f.select.disabled=true;
 f.document.activeElement=f.select;
 f.handlers.focusin({type:'focusin',target:f.select});
 assert.equal(f.document.activeElement,f.close,
  'disabled graphics controls must not retain focus');
 f.select.disabled=false;
 f.document.activeElement=f.select;
 f.handlers.focusin({type:'focusin',target:f.select});
 assert.equal(f.document.activeElement,f.select,
  'visible settings dropdown retains native keyboard focus');
 f.select.tabIndex=-1;
 f.document.activeElement=f.select;
 f.handlers.focusin({type:'focusin',target:f.select});
 assert.equal(f.document.activeElement,f.select,
  'visible roving-tabindex buttons may receive direct focus without becoming Tab destinations');
});
