'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {auditStoryOpening}=require('../scripts/verify-pc-viewport.cjs');

function fixture(blocked=false){
 const box=(left,top,right,bottom)=>({left,top,right,bottom,width:right-left,height:bottom-top});
 let result=null,focused=null;
 const node=(tag,rect)=>({
  tagName:tag.toUpperCase(),disabled:false,hidden:false,textContent:'',
  classList:{add(){},remove(){}},
  getClientRects(){return [rect];},getBoundingClientRect(){return rect;},
  scrollHeight:rect.height,clientHeight:rect.height,scrollWidth:rect.width,clientWidth:rect.width,
  contains(other){return other===this;},focus(){focused=this;}
 });
 const root=node('section',box(0,0,1024,600)),
  card=node('div',box(190,140,834,455)),
  title=node('h1',box(214,190,810,235)),
  caption=node('p',box(214,252,810,310)),
  button=node('button',box(214,355,428,403));
 root.querySelector=selector=>selector==='.card'?card:selector==='[data-opening-next]'?button:
  selector==='[data-opening-line]'?caption:null;
 card.querySelectorAll=()=>[title,caption,button];
 const nodes={chapterOpening:root,menu:node('section',box(0,0,1024,600)),
  choices:node('section',box(0,0,1024,600))};
 const document={
  getElementById:id=>nodes[id]||null,
  get activeElement(){return focused;},
  documentElement:{scrollHeight:600,scrollWidth:1024,
   setAttribute(key,value){if(key==='data-vp-opening-geometry')
    result=JSON.parse(Buffer.from(value,'base64').toString('utf8'));}},
  elementFromPoint(x,y){
   const rect=button.getBoundingClientRect();
   if(x>=rect.left&&x<=rect.right&&y>=rect.top&&y<=rect.bottom){
    if(blocked&&x===rect.left+rect.width*.25&&y===rect.top+rect.height*.25)
     return node('div',box(x-2,y-2,x+2,y+2));
    return button;
   }
   return card;
  }
 };
 vm.runInNewContext('('+auditStoryOpening.toString()+')("한국에서 출국 전에 정식 임무 내용을 브리핑받았다.")',
  {document,innerWidth:1024,innerHeight:600,
   getComputedStyle:()=>({display:'block',visibility:'visible'}),
   btoa:s=>Buffer.from(s,'utf8').toString('base64')},{timeout:1000});
 return result;
}

test('real CH01 briefing modal geometry requires five-button probes and keyboard focus',()=>{
 const measured=fixture();
 assert.equal(measured.cases.length,1);
 assert.equal(measured.errors.length,0);
 assert.deepEqual(measured.cases[0].targets.map(t=>t.id),['chapterOpeningNext']);
 assert.equal(measured.cases[0].targets[0].probesPassed,5);
 assert.equal(measured.cases[0].targets[0].focused,true);
});
test('covered CH01 briefing control fails the full-screen geometry gate',()=>{
 const measured=fixture(true);
 assert.ok(measured.errors.some(e=>e.includes('opening action inaccessible')));
 assert.equal(measured.cases[0].targets[0].probesPassed,4);
});
