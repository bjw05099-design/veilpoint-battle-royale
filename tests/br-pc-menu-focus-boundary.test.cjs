'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const src=fs.readFileSync(path.resolve(__dirname,'../src/app.js'),'utf8');
const start=src.indexOf('function containBRMenuFocus(event){');
const end=src.indexOf('// Portable loading never assumes',start);
assert.ok(start>=0&&end>start,'BR pause focus boundary is linked into app');

function fixture(){
 const handlers={},nodes={};
 const classes=()=>{const s=new Set();return {
  add:id=>s.add(id),remove:id=>s.delete(id),contains:id=>s.has(id)
 }};
 const document={activeElement:null,addEventListener(type,cb,capture){
  assert.equal(capture,true);handlers[type]=cb;
 }};
 const ids=['play','newMatch','brViewMore','brViewBack','brImportApply'];
 for(const id of ids){
  nodes[id]={id,disabled:false,tabIndex:0,classList:classes(),
   getClientRects(){return this.classList.contains('hidden')?[]:[{}];},
   focus(){document.activeElement=this;}
  };
 }
 nodes.brViewBack.classList.add('hidden');
 const overlay=nodes.overlay={classList:classes(),
  querySelectorAll(){return ids.map(id=>nodes[id]);},
  contains:node=>ids.some(id=>nodes[id]===node)};
 const settings=nodes.graphicsPanel={classList:classes()};
 settings.classList.add('hidden');
 vm.runInNewContext(src.slice(start,end),{
  document,$:id=>nodes[id],
  getComputedStyle:node=>({display:node.classList.contains('hidden')?'none':'block',
   visibility:'visible'})
 },{timeout:1000});
 return {handlers,nodes,overlay,settings,document};
}

test('Tab wraps between visible BR menu controls instead of reaching HUD',()=>{
 const f=fixture(),visible=[f.nodes.play,f.nodes.newMatch,f.nodes.brViewMore,f.nodes.brImportApply];
 f.document.activeElement=visible[3];
 let prevented=0;
 f.handlers.keydown({type:'keydown',key:'Tab',shiftKey:false,
  preventDefault(){prevented++;}});
 assert.equal(prevented,1);
 assert.equal(f.document.activeElement,visible[0]);
 f.handlers.keydown({type:'keydown',key:'Tab',shiftKey:true,
  preventDefault(){prevented++;}});
 assert.equal(prevented,2);
 assert.equal(f.document.activeElement,visible[3]);
});

test('focus returning from outside a paused BR menu enters a visible control',()=>{
 const f=fixture(),hud={id:'hidden-hud'};
 f.document.activeElement=hud;
 f.handlers.focusin({type:'focusin',target:hud});
 assert.equal(f.document.activeElement,f.nodes.play);
});

test('BR focus trap yields to the separate graphics dialog and live game',()=>{
 const f=fixture(),hud={id:'hud'};
 f.document.activeElement=hud;
 f.settings.classList.remove('hidden');
 let prevented=0;
 f.handlers.keydown({type:'keydown',key:'Tab',shiftKey:false,
  preventDefault(){prevented++;}});
 f.handlers.focusin({type:'focusin',target:hud});
 assert.equal(f.document.activeElement,hud);
 f.settings.classList.add('hidden');
 f.overlay.classList.add('hidden');
 f.handlers.keydown({type:'keydown',key:'Tab',shiftKey:false,
  preventDefault(){prevented++;}});
 assert.equal(prevented,0);
 assert.equal(f.document.activeElement,hud);
});

test('disabled and hidden buttons are not used as keyboard focus targets',()=>{
 const f=fixture();
 f.nodes.play.disabled=true;
 f.nodes.brImportApply.classList.add('hidden');
 f.document.activeElement=f.nodes.brViewMore;
 let prevented=0;
 f.handlers.keydown({type:'keydown',key:'Tab',shiftKey:false,
  preventDefault(){prevented++;}});
 assert.equal(prevented,1);
 assert.equal(f.document.activeElement,f.nodes.newMatch);
});

test('BR focus boundary never inspects controls for Escape or other gameplay keys',()=>{
 const f=fixture();
 f.overlay.querySelectorAll=()=>{throw new Error('non-navigation key must not enumerate DOM');};
 for(const key of ['Escape','KeyG','KeyW','Space']){
  let prevented=0;
  f.handlers.keydown({type:'keydown',key,shiftKey:false,
   preventDefault(){prevented++;}});
  assert.equal(prevented,0);
 }
});
