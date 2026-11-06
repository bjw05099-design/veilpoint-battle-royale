'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const src=fs.readFileSync(path.join(__dirname,'../src/story-app.js'),'utf8');
const first=src.indexOf("  let fieldJournalReturnView='main',journalPage=0;");
const last=src.indexOf("  $('pauseButton').addEventListener",first);
assert.ok(first>=0&&last>first,'real CH01 journal handlers must be present');

function fixture(initialView='main',entryCount=1){
 const ids=['fieldJournal','fieldJournalEntries','fieldJournalClose','fieldJournalOpen',
  'fieldJournalPageStatus','fieldJournalPrev','fieldJournalNext','continue'];
 const nodes={},calls=[],listeners={};
 const document={activeElement:null,addEventListener(name,fn,capture){
  assert.equal(capture,true);listeners[name]=fn;
 }};
 const classes=()=>{
  const set=new Set(['hidden']);
  return {add(key){set.add(key);},remove(key){set.delete(key);},contains(key){return set.has(key);}};
 };
 for(const id of ids){
  const handlers={};
  nodes[id]={id,classList:classes(),textContent:'',handlers,disabled:false,
   getClientRects(){return [{}];},
   addEventListener(type,fn){handlers[type]=fn;},
   click(){if(!this.disabled&&handlers.click)handlers.click();},
   focus(){calls.push('focus:'+id);document.activeElement=this;},
   appendChild(child){(this.children||(this.children=[])).push(child);}};
 }
 const menu={classList:{contains:key=>key==='menu-view-'+initialView}};
 const ctx={menu,state:{phase:'records'},$:id=>nodes[id],
  global:{getComputedStyle:()=>({display:'block',visibility:'visible'}),
   VeilpointFieldJournal:{entries:()=>Object.freeze(
   Array.from({length:entryCount},(_,i)=>({
    title:'현장 기록 '+(i+1),detail:'확인 내용 '+(i+1)})))}},
  document:Object.assign(document,{createElement(){return {textContent:''};}}),
  setStoryMenuView(view,focus){calls.push('page:'+view);
   if(focus&&view==='main')nodes.continue.focus();}};
 vm.runInNewContext(src.slice(first,last),ctx,{timeout:1000});
 return {ctx,nodes,calls,listeners,document};
}
test('CH01 field journal opens over visible Tools page and focuses its Close control',()=>{
 const f=fixture();
 f.nodes.fieldJournalOpen.handlers.click();
 assert.deepEqual(f.calls,['page:tools','focus:fieldJournalClose']);
 assert.equal(f.nodes.fieldJournal.classList.contains('hidden'),false);
 assert.equal(f.nodes.fieldJournalEntries.children.length,1);
 assert.match(f.nodes.fieldJournalEntries.children[0].textContent,/현장 기록/);
});
test('CH01 journal Close returns to an actually visible Tools control',()=>{
 const f=fixture('tools');
 f.nodes.fieldJournalOpen.handlers.click();
 f.calls.length=0;
 f.nodes.fieldJournalClose.handlers.click();
 assert.equal(f.nodes.fieldJournal.classList.contains('hidden'),true);
 assert.deepEqual(f.calls,['page:tools','focus:fieldJournalOpen']);
});
test('CH01 J/G shortcut interception does not steal keystrokes from JSON editor or controls',()=>{
 const begin=src.indexOf("    if((e.code==='KeyJ'||e.code==='KeyG')&&e.target&&");
 const end=src.indexOf('    // J opens the field journal',begin);
 assert.ok(begin>=0&&end>begin,'editor shortcut guard must precede journal shortcut');
 const testGuard=new Function('e',src.slice(begin,end)+'return "continue";');
 for(const code of ['KeyJ','KeyG']){
  for(const tagName of ['TEXTAREA','INPUT']){
   assert.equal(testGuard({code,target:{tagName}}),undefined,
    code+' must not close the '+tagName+' editing surface');
  }
  assert.equal(testGuard({code,target:{tagName:'DIV',isContentEditable:true}}),undefined);
  assert.equal(testGuard({code,target:{tagName:'SELECT'}}),
   code==='KeyJ'?undefined:'continue',
   'G from graphics selector retains the established return-to-menu shortcut');
  assert.equal(testGuard({code,target:{tagName:'BUTTON'}}),'continue',
   'ordinary PC menu buttons may still use documented shortcuts');
 }
 assert.equal(testGuard({code:'Escape',target:{tagName:'TEXTAREA'}}),'continue',
  'Escape is handled separately by menu cancellation logic');
});

test('CH01 journal opened by J from live play returns to Main for the second Escape',()=>{
 const f=fixture('main');
 f.nodes.fieldJournalOpen.handlers.click();
 f.calls.length=0;
 f.nodes.fieldJournalClose.handlers.click();
 assert.deepEqual(f.calls,['page:main','focus:continue']);
 assert.equal(f.nodes.fieldJournal.classList.contains('hidden'),true);
});

test('CH01 journal pages expose every earned record with no hidden overflow list',()=>{
 const f=fixture('tools',5);
 f.nodes.fieldJournalOpen.click();
 assert.equal(f.nodes.fieldJournalEntries.children.length,2);
 assert.match(f.nodes.fieldJournalPageStatus.textContent,/1 \/ 3/);
 assert.equal(f.nodes.fieldJournalPrev.disabled,true);
 assert.equal(f.nodes.fieldJournalNext.disabled,false);
 f.nodes.fieldJournalNext.click();
 assert.match(f.nodes.fieldJournalPageStatus.textContent,/2 \/ 3/);
 assert.equal(f.nodes.fieldJournalNext.disabled,false);
 f.nodes.fieldJournalNext.click();
 assert.match(f.nodes.fieldJournalPageStatus.textContent,/3 \/ 3/);
 assert.equal(f.nodes.fieldJournalNext.disabled,true);
 f.nodes.fieldJournalPrev.click();
 assert.match(f.nodes.fieldJournalPageStatus.textContent,/2 \/ 3/);
});

test('CH01 Tab cycles only enabled field journal controls and never reaches the game',()=>{
 const f=fixture('tools',5);
 f.nodes.fieldJournalOpen.click();
 const fire=(shift=false)=>{
  let count=0;f.listeners.keydown({type:'keydown',key:'Tab',shiftKey:shift,
   preventDefault(){count++;}});return count;
 };
 // On the first page Prev is disabled; Close is last focusable.
 assert.equal(f.nodes.fieldJournalPrev.disabled,true);
 assert.equal(f.document.activeElement,f.nodes.fieldJournalClose);
 assert.equal(fire(),1);
 assert.equal(f.document.activeElement,f.nodes.fieldJournalNext);
 assert.equal(fire(true),1);
 assert.equal(f.document.activeElement,f.nodes.fieldJournalClose);
 // On the last page Next is disabled; Prev is first focusable.
 f.nodes.fieldJournalNext.click();f.nodes.fieldJournalNext.click();
 assert.equal(f.nodes.fieldJournalNext.disabled,true);
 f.nodes.fieldJournalClose.focus();
 assert.equal(fire(),1);
 assert.equal(f.document.activeElement,f.nodes.fieldJournalPrev);
 assert.equal(fire(true),1);
 assert.equal(f.document.activeElement,f.nodes.fieldJournalClose);
});
test('CH01 field journal reclaims external focus and releases trap after closing',()=>{
 const f=fixture('main',3);
 f.nodes.fieldJournalOpen.click();
 const external={id:'underlying-game'};
 f.document.activeElement=external;
 f.listeners.focusin({type:'focusin',target:external});
 assert.equal(f.document.activeElement,f.nodes.fieldJournalClose);
 const before=f.calls.length;
 f.nodes.fieldJournalClose.click();
 f.document.activeElement=external;
 let trapped=0;
 f.listeners.keydown({type:'keydown',key:'Tab',shiftKey:false,
  preventDefault(){trapped++;}});
 f.listeners.focusin({type:'focusin',target:external});
 assert.equal(trapped,0);
 assert.equal(f.document.activeElement,external);
 assert.equal(f.calls.length,before+2,
  'journal closing returns focus to Main but never captures later external focus');
});
