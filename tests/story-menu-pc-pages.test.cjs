'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const src=fs.readFileSync(path.resolve(__dirname,'../src/story-app.js'),'utf8');
const html=fs.readFileSync(path.resolve(__dirname,'../story.html'),'utf8');
const gate=fs.readFileSync(path.resolve(__dirname,'../scripts/verify-pc-viewport.cjs'),'utf8');
const start=src.indexOf('  const storyMenuViews=');
const end=src.indexOf('  function menuOpen(text){',start);
assert.ok(start>=0&&end>start,'CH01 menu view controller exists');
function fixture(){
 const eventHandlers={};
 const makeClasses=()=>{const set=new Set();return {
  add(name){set.add(name);},remove(name){set.delete(name);},
  contains(name){return set.has(name);},
  toggle(name,on){if(on)set.add(name);else set.delete(name);}
 }};
 const nodes={};
 const document={activeElement:null,addEventListener(name,fn,capture){
  assert.equal(capture,true);eventHandlers[name]=fn;
 }};
 const ids=['continue','newGame','storyGraphicsOpen','storyMenuMore','storyMenuAbout',
  'storyMenuBack','quality','checkpointTransferText','checkpointTransferPanel','checkpointFile','fieldJournal'];
 for(const id of ids){
  const callbacks={};
  nodes[id]={id,value:'initial',disabled:false,tabIndex:0,classList:makeClasses(),
   addEventListener(name,fn){callbacks[name]=fn;},
   click(){if(callbacks.click)callbacks.click();},
   focus(){document.activeElement=this;},
   getClientRects(){return [{}];}
  };
 }
 nodes.fieldJournal.classList.add('hidden');
 const menu=nodes.menu={classList:makeClasses(),contains(n){return ids.some(id=>nodes[id]===n);},
  querySelectorAll(){return [nodes.continue,nodes.newGame,nodes.storyMenuBack];}};
 const choices={classList:makeClasses()};choices.classList.add('hidden');
 const ctx={document,menu,choices,$:id=>nodes[id],global:{getComputedStyle:()=>({display:'block',visibility:'visible'})},
  checkpointFileRequest:2,portableImportArmed:'untrusted',graphicsMenuFocused:true};
 vm.runInNewContext(src.slice(start,end),ctx,{timeout:1000});
 return {ctx,nodes,menu,document,eventHandlers};
}
test('CH01 tools and about pages transfer keyboard focus without resuming 60Hz gameplay',()=>{
 const f=fixture();
 f.nodes.storyMenuMore.click();
 assert.equal(f.menu.classList.contains('menu-view-tools'),true);
 assert.equal(f.document.activeElement.id,'storyMenuBack');
 f.nodes.storyMenuAbout.click();
 assert.equal(f.menu.classList.contains('menu-view-tools'),false);
 assert.equal(f.menu.classList.contains('menu-view-about'),true);
});
test('CH01 closing JSON page invalidates pending file reads and returns focus to Continue',()=>{
 const f=fixture();
 f.ctx.setStoryMenuView('import',true);
 assert.equal(f.document.activeElement.id,'checkpointTransferText');
 f.nodes.storyMenuBack.click();
 assert.equal(f.ctx.checkpointFileRequest,3);
 assert.equal(f.ctx.portableImportArmed,null);
 assert.equal(f.nodes.checkpointTransferPanel.classList.contains('hidden'),true);
 assert.equal(f.nodes.checkpointTransferText.value,'');
 assert.equal(f.nodes.checkpointFile.value,'');
 assert.equal(f.document.activeElement.id,'continue');
});
test('CH01 menu trap cycles Tab within visible controls and releases when hidden',()=>{
 const f=fixture();
 f.document.activeElement=f.nodes.storyMenuBack;
 let prevented=0;
 f.eventHandlers.keydown({type:'keydown',key:'Tab',shiftKey:false,
  preventDefault(){prevented++;}});
 assert.equal(prevented,1);
 assert.equal(f.document.activeElement,f.nodes.continue);
 f.menu.classList.add('hidden');
 prevented=0;
 f.eventHandlers.keydown({type:'keydown',key:'Tab',shiftKey:true,
  preventDefault(){prevented++;}});
 assert.equal(prevented,0);
});
test('CH01 layout gate checks every new page using Chrome not a string-only CSS assertion',()=>{
 for(const id of ['storyMenuMore','storyMenuAbout','storyMenuBack','checkpointTransferPanel'])
  assert.ok(html.includes('id="'+id+'"'));
 for(const name of ['tools','settings','import','export','about'])
  assert.ok(gate.includes("'"+name+"'"),'missing mode '+name);
 assert.match(gate,/auditStoryMenu\.toString\(\)/);
 assert.match(gate,/menuRecords\.flatMap\(/);
 assert.match(gate,/data\.cases\.length,6/);
 assert.match(gate,/document\.elementFromPoint\(rect\.left\+rect\.width\*fx/);
 assert.match(gate,/storyMenuChecks:menuRecords/);
});

test('CH01 page keys remain compatible with strict offline JavaScript packaging',()=>{
 const prohibited=/\bimport\b\s*(?:\(|\{|["'*]|[A-Za-z_$])/;
 assert.equal(prohibited.test(src),false,'offline package scanner must not mistake page names for module imports');
 const f=fixture();
 f.ctx.setStoryMenuView('import',true);
 assert.equal(f.menu.classList.contains('menu-view-import'),true);
});

test('CH01 pause-menu focus trap yields to an open field journal',()=>{
 const f=fixture();
 const journalClose={id:'fieldJournalClose'};
 f.nodes.fieldJournal.classList.remove('hidden');
 f.document.activeElement=journalClose;
 f.eventHandlers.focusin({type:'focusin',target:journalClose});
 assert.equal(f.document.activeElement,journalClose,
  'visible field journal must retain keyboard focus outside background menu');
 let prevented=0;
 f.eventHandlers.keydown({type:'keydown',key:'Tab',shiftKey:false,
  preventDefault(){prevented++;}});
 assert.equal(prevented,0,'background menu cannot trap the journal Tab key');
});
