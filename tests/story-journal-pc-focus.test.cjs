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
 const nodes={},calls=[];
 const classes=()=>{
  const set=new Set(['hidden']);
  return {add(key){set.add(key);},remove(key){set.delete(key);},contains(key){return set.has(key);}};
 };
 for(const id of ids){
  const handlers={};
  nodes[id]={id,classList:classes(),textContent:'',handlers,disabled:false,
   addEventListener(type,fn){handlers[type]=fn;},
   click(){if(!this.disabled&&handlers.click)handlers.click();},
   focus(){calls.push('focus:'+id);},
   appendChild(child){(this.children||(this.children=[])).push(child);}};
 }
 const menu={classList:{contains:key=>key==='menu-view-'+initialView}};
 const ctx={menu,state:{phase:'records'},$:id=>nodes[id],
  global:{VeilpointFieldJournal:{entries:()=>Object.freeze(
   Array.from({length:entryCount},(_,i)=>({
    title:'현장 기록 '+(i+1),detail:'확인 내용 '+(i+1)})))}},
  document:{createElement(){return {textContent:''};}},
  setStoryMenuView(view,focus){calls.push('page:'+view);
   if(focus&&view==='main')nodes.continue.focus();}};
 vm.runInNewContext(src.slice(first,last),ctx,{timeout:1000});
 return {ctx,nodes,calls};
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
