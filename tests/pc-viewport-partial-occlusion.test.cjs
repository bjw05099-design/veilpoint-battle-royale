'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {audit}=require('../scripts/verify-pc-viewport.cjs');

function geometryFixture(coverCorner=false,playOutsidePanel=false){
 const ids=['overlay','graphicsPanel','play','newMatch','brViewMore',
  'graphicsPauseOpen','brViewBack','brImport','brExport','brImportFile',
  'brImportApply','brExportDownload','graphicsClose','graphicsTabVisual',
  'graphicsTabControls','graphicsTabBenchmark','graphicsPreset',
  'desktopBindKey','benchmarkStart','brImportPanel','brExportPanel',
  'graphicsVisualPage','graphicsControlsPage','graphicsBenchmarkPage'];
 const nodes={};
 let geometry=null;
 const classes=()=>{const names=new Set();return {
  add(name){names.add(name);},remove(...items){items.forEach(name=>names.delete(name));},
  toggle(name,on){if(on)names.add(name);else names.delete(name);},
  contains(name){return names.has(name);}
 }};
 for(const [index,id] of ids.entries()){
  const x=60+(index%6)*125,y=60+Math.floor(index/6)*75;
  const rect={left:x,top:y,right:x+80,bottom:y+40,width:80,height:40};
  nodes[id]={id,tagName:'BUTTON',disabled:false,tabIndex:0,
   classList:classes(),scrollHeight:500,clientHeight:500,
   scrollWidth:800,clientWidth:800,
   getBoundingClientRect(){return rect;},
   getClientRects(){return [rect];},
   contains(other){return other===this;},
   matches(selector){return selector.includes('button');},
   querySelectorAll(){return [];},
   focus(){doc.activeElement=this;}
  };
 }
 for(const id of ['overlay','graphicsPanel']){
  nodes[id].getBoundingClientRect=()=>({
   left:0,top:0,right:1024,bottom:600,width:1024,height:600});
  nodes[id].querySelectorAll=()=>[nodes.play];
  // Simulate the DOM's actual containment contract, not just geometry.
  // A control rendered at a valid coordinate is not necessarily owned
  // by the currently visible page.
  const brIds=new Set(['play','newMatch','brViewMore','graphicsPauseOpen',
   'brViewBack','brImport','brExport','brImportFile','brImportApply',
   'brExportDownload','brImportPanel','brExportPanel']);
  const graphicsIds=new Set(['graphicsClose','graphicsTabVisual',
   'graphicsTabControls','graphicsTabBenchmark','graphicsPreset',
   'desktopBindKey','benchmarkStart','graphicsVisualPage',
   'graphicsControlsPage','graphicsBenchmarkPage']);
  nodes[id].contains=other=>other===nodes[id]||
   (!((playOutsidePanel)&&other===nodes.play)&&
    (id==='overlay'?brIds:graphicsIds).has(other?.id));
 }
 const doc={activeElement:null,
  documentElement:{scrollHeight:600,scrollWidth:1024,
   setAttribute(name,value){if(name==='data-vp-geometry')
    geometry=JSON.parse(Buffer.from(value,'base64').toString('utf8'));}},
  getElementById:id=>nodes[id]||null,
  elementFromPoint(x,y){
   const play=nodes.play.getBoundingClientRect();
   if(coverCorner&&x===play.left+play.width*.25&&
      y===play.top+play.height*.25)
    return {id:'cover',tagName:'DIV'};
   return Object.values(nodes).find(node=>{
    if(node.id==='overlay'||node.id==='graphicsPanel')return false;
    const box=node.getBoundingClientRect();
    return x>=box.left&&x<=box.right&&y>=box.top&&y<=box.bottom;
   })||null;
  }
 };
 vm.runInNewContext('('+audit.toString()+')()',{
  document:doc,innerWidth:1024,innerHeight:600,
  getComputedStyle:()=>({display:'block',visibility:'visible'}),
  btoa:value=>Buffer.from(value,'utf8').toString('base64')
 },{timeout:1000});
 return geometry;
}
test('Chromium geometry audit detects one-quarter occlusion even when center remains clickable',()=>{
 const result=geometryFixture(true);
 assert.equal(result.cases.length,7);
 const main=result.cases.find(page=>page.name==='BR-main');
 const play=main.targets.find(target=>target.id==='play');
 assert.equal(play.hit,false);
 assert.equal(play.probesPassed,4);
 assert.ok(main.issues.some(issue=>issue.id==='play'&&
  issue.reason==='required button is covered or not clickable'&&
  issue.probesPassed===4));
});
test('fully uncovered PC controls remain clickable with five hit-test points',()=>{
 const result=geometryFixture(false);
 const main=result.cases.find(page=>page.name==='BR-main');
 const play=main.targets.find(target=>target.id==='play');
 assert.equal(play.hit,true);
 assert.equal(play.probesPassed,5);
 assert.ok(!main.issues.some(issue=>issue.id==='play'));
});

test('a geometrically visible BR button is rejected if detached from the active menu',()=>{
 const result=geometryFixture(false,true);
 const main=result.cases.find(page=>page.name==='BR-main');
 const target=main.targets.find(t=>t.id==='play');
 assert.equal(target.visible,true);
 assert.equal(target.enabled,true);
 assert.equal(target.hit,undefined);
 assert.ok(main.issues.some(issue=>issue.id==='play'&&
  issue.reason==='required control outside active page, hidden, missing or disabled'));
});
