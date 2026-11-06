'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const {auditStoryJournal}=require('../scripts/verify-pc-viewport.cjs');
const source=fs.readFileSync(path.join(__dirname,'../scripts/verify-pc-viewport.cjs'),'utf8');
const rows=Array.from({length:6},(_,i)=>({title:'현장 기록 '+i,detail:'직접 확인된 경로 '+i}));

function fixture({blocked=false,scroll=false}={}){
 let evidence=null;
 const bounds=(l,t,r,b)=>({left:l,top:t,right:r,bottom:b,width:r-l,height:b-t});
 const box=(id,rect,tag='DIV')=>({
  id,tagName:tag,disabled:false,
  scrollHeight:400,clientHeight:400,scrollWidth:650,clientWidth:650,
  getBoundingClientRect(){return rect;},getClientRects(){return [rect];},
  contains(node){return this===node;},
  matches(s){return tag==='BUTTON'&&s==='button';},
  focus(){document.activeElement=this;}
 });
 const root=box('fieldJournal',bounds(0,0,1024,600));
 const card=box('card',bounds(180,90,850,500));
 const entries=box('fieldJournalEntries',bounds(200,215,830,400));
 const status=box('fieldJournalPageStatus',bounds(200,400,650,420),'P');
 const close=box('fieldJournalClose',bounds(600,445,805,480),'BUTTON');
 const prev=box('fieldJournalPrev',bounds(210,445,380,480),'BUTTON');
 const next=box('fieldJournalNext',bounds(395,445,580,480),'BUTTON');
 const nodes={fieldJournal:root,fieldJournalEntries:entries,
  fieldJournalPageStatus:status,fieldJournalClose:close,
  fieldJournalPrev:prev,fieldJournalNext:next,
  menu:box('menu',bounds(0,0,1024,600)),
  choices:box('choices',bounds(0,0,1024,600))};
 for(const node of [root,nodes.menu,nodes.choices]){
  node.classList={add(){},remove(){}};
 }
 root.querySelector=sel=>sel==='.card'?card:null;
 entries.textContent='';
 entries.appendChild=node=>{(entries.children||(entries.children=[])).push(node);};
 card.querySelectorAll=()=>[entries,status,prev,next,close,...(entries.children||[])];
 if(scroll){card.clientHeight=300;card.scrollHeight=490;}
 const document={
  activeElement:null,
  documentElement:{scrollHeight:600,scrollWidth:1024,
   setAttribute(key,value){if(key==='data-vp-journal-geometry')
    evidence=JSON.parse(Buffer.from(value,'base64').toString('utf8'));}},
  getElementById:id=>nodes[id]||null,
  createElement(tag){
   return box('',bounds(210,220,780,260),tag.toUpperCase());
  },
  elementFromPoint(x,y){
   for(const node of [prev,next,close]){
    const r=node.getBoundingClientRect();
    if(x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom){
     if(blocked&&node===next&&x===r.left+r.width*.25&&
        y===r.top+r.height*.25)return box('obstruction',bounds(x-2,y-2,x+2,y+2));
     return node;
    }
   }
   return card;
  }
 };
 vm.runInNewContext('('+auditStoryJournal.toString()+')('+JSON.stringify(rows)+')',{
  document,innerWidth:1024,innerHeight:600,
  getComputedStyle:()=>({display:'block',visibility:'visible',overflowX:'visible',overflowY:'visible'}),
  btoa:raw=>Buffer.from(raw,'utf8').toString('base64')
 },{timeout:1000});
 return evidence;
}
test('CH01 journal first and final pages pass geometry and PC focus checks',()=>{
 const data=fixture();
 assert.equal(data.cases.length,2);
 assert.equal(data.errors.length,0);
 assert.deepEqual(data.cases.map(p=>p.targets.length),[2,2]);
 assert.ok(data.cases.every(c=>c.targets.every(t=>t.hit&&t.focused)));
});
test('CH01 journal geometry rejects a partially covered next button',()=>{
 const data=fixture({blocked:true});
 assert.ok(data.errors.some(x=>x.includes('CH01 journal control covered')));
 assert.equal(data.cases[0].targets.find(t=>t.id==='fieldJournalNext').probesPassed,4);
});
test('CH01 journal geometry rejects nested overflow of a completed journal',()=>{
 const data=fixture({scroll:true});
 assert.ok(data.errors.some(x=>x.includes('CH01 journal outer scroll')));
});
test('Linux and Windows PC viewport script includes real completed-journal evidence',()=>{
 assert.match(source,/auditStoryJournal\.toString\(\)/);
 assert.match(source,/completedJournal=require\(/);
 assert.match(source,/storyJournalChecks:journalRecords/);
 assert.match(source,/journalRecords\.flatMap\(/);
 assert.match(source,/data\.cases\.length,2/);
});
