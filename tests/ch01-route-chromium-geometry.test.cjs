'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const {auditStoryRoute}=require('../scripts/verify-pc-viewport.cjs');
const source=fs.readFileSync(path.resolve(__dirname,'../scripts/verify-pc-viewport.cjs'),'utf8');

function fixture({covered=false,clipped=false,disabled=false,scroll=false}={}){
 const nodes={};
 let payload=null;
 const rect=(left,top,right,bottom)=>({left,top,right,bottom,
  width:right-left,height:bottom-top});
 const box=(id,bounds,tagName='DIV')=>({
  id,tagName,disabled:false,scrollHeight:300,clientHeight:300,
  scrollWidth:450,clientWidth:450,
  getBoundingClientRect(){return bounds;},getClientRects(){return [bounds];},
  matches(selector){return tagName==='BUTTON'&&selector==='button';},
  contains(other){return this===other;},
  focus(){document.activeElement=this;}
 });
 const card=box('card',rect(100,75,575,480));
 const choices=box('choices',rect(0,0,1024,600));
 const menu=box('menu',rect(0,0,1024,600));
 const hint=box('choiceHint',rect(130,250,540,310),'P');
 const heading=box('choiceHeading',rect(130,135,550,230),'H1');
 const labels=['choiceEvac','choiceVerified','choiceBack'];
 labels.forEach((id,i)=>{
  const left=115+i*145;
  nodes[id]=box(id,rect(left,340,left+120,390),'BUTTON');
 });
 if(clipped)nodes.choiceBack.getBoundingClientRect=()=>rect(930,340,1050,390);
 if(disabled)nodes.choiceVerified.disabled=true;
 if(scroll){card.scrollHeight=350;card.clientHeight=300;}
 choices.classList={add(){},remove(){}};
 menu.classList={add(){},remove(){}};
 choices.querySelector=selector=>selector==='.card'?card:null;
 card.querySelectorAll=()=>[heading,hint,...labels.map(id=>nodes[id])];
 nodes.choices=choices;nodes.menu=menu;nodes.choiceHint=hint;
 const document={
  activeElement:null,
  documentElement:{
   scrollHeight:600,scrollWidth:1024,
   setAttribute(name,value){
    if(name==='data-vp-story-geometry')payload=
     JSON.parse(Buffer.from(value,'base64').toString('utf8'));
   }
  },
  getElementById:id=>nodes[id]||null,
  elementFromPoint(x,y){
   for(const id of labels){
    const node=nodes[id],bounds=node.getBoundingClientRect();
    if(x>=bounds.left&&x<=bounds.right&&y>=bounds.top&&y<=bounds.bottom){
     if(covered&&id==='choiceEvac'&&x===bounds.left+bounds.width*.25&&
        y===bounds.top+bounds.height*.25)
      return box('blockingPanel',rect(x-2,y-2,x+2,y+2));
     return node;
    }
   }
   return choices;
  }
 };
 vm.runInNewContext('('+auditStoryRoute.toString()+')()',{
  document,innerWidth:1024,innerHeight:600,
  getComputedStyle:()=>({display:'block',visibility:'visible',
   overflowX:'visible',overflowY:'visible'}),
  btoa:text=>Buffer.from(text,'utf8').toString('base64')
 },{timeout:1000});
 return payload;
}
test('CH01 route browser geometry accepts three visible clickable controls',()=>{
 const report=fixture();
 assert.equal(report.cases.length,1);
 assert.equal(report.cases[0].name,'CH01-route');
 assert.equal(report.cases[0].controls,3);
 assert.equal(report.errors.length,0);
 assert.equal(report.cases[0].targets.every(t=>t.hit&&t.focused&&t.probesPassed===5),true);
});
test('CH01 route catches quadrant occlusion despite clickable center',()=>{
 const report=fixture({covered:true});
 assert.ok(report.errors.some(x=>x.includes('CH01 route button occluded')));
 assert.equal(report.cases[0].targets[0].probesPassed,4);
});
test('CH01 route catches clipped, disabled and vertically scrolling dialogs',()=>{
 for(const params of [{clipped:true},{disabled:true},{scroll:true}]){
  const report=fixture(params);
  assert.ok(report.errors.length>0,JSON.stringify(params)+' must fail');
 }
});
test('Linux/Windows release gate runs CH01 real Chromium viewport measurement',()=>{
 assert.match(source,/Page\.setDocumentContent.*storyHtml/);
 assert.match(source,/auditStoryRoute\.toString\(\)/);
 assert.match(source,/storyRecords\.push\(/);
 assert.match(source,/storyRecords\.flatMap\(/);
 assert.match(source,/CH01 route.*clipping issues/);
 for(const size of ['2560,1440','1366,768','1280,720','1024,600'])
  assert.ok(source.includes(size));
});
