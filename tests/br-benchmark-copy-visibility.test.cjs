'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const src=fs.readFileSync(path.join(__dirname,'../src/app.js'),'utf8');
const graphicsStart=src.indexOf('function setGraphicsSettingsScreen(');
const graphicsEnd=src.indexOf('const graphicsTabScreens=',graphicsStart);
const revealStart=src.indexOf('function revealBenchmarkJson(');
const revealEnd=src.indexOf('const saveBenchmark=',revealStart);
assert.ok(graphicsStart>=0&&graphicsEnd>graphicsStart);
assert.ok(revealStart>=0&&revealEnd>revealStart);
const functions=src.slice(graphicsStart,graphicsEnd)+'\n'+src.slice(revealStart,revealEnd);

function fixture({open=false,screen='visual',state='finished',frames=180,reason='completed'}={}){
 const nodes={};
 const ids=['graphicsPanel','graphicsPauseOpen','graphicsVisualPage',
  'graphicsControlsPage','graphicsBenchmarkPage',
  'graphicsTabVisual','graphicsTabControls','graphicsTabBenchmark'];
 function node(id){
  const classes=new Set();
  const el={id,tabIndex:0,attributes:{},
   classList:{
    add:x=>classes.add(x),remove:x=>classes.delete(x),
    contains:x=>classes.has(x),
    toggle(x,flag){if(flag)classes.add(x);else classes.delete(x);}
   },setAttribute(name,value){this.attributes[name]=String(value);},
   focus(){ctx.active=id;},select(){ctx.selected=id;}};
  nodes[id]=el;return el;
 }
 for(const id of ids)node(id);
 const raw=node('benchmarkRawJson'),label=node('benchmarkRawLabel'),help=node('benchmarkExportHelp');
 raw.classList.add('hidden');label.classList.add('hidden');
 if(!open)nodes.graphicsPanel.classList.add('hidden');
 const report={completed:reason==='completed',renderedFrameCount:frames,measurementStatus:reason==='completed'?'complete':'partial'};
 const ctx={active:null,selected:null,opened:0,pausedWorldSteps:0,
  benchmark:{getStatus(){return {state,frames}},report(){return report}},
  benchmarkRawJson:raw,benchmarkRawLabel:label,benchmarkExportHelp:help,
  desktopUi:{cancel(){}},
  $:id=>nodes[id],
  setGraphicsPanelOpen(next){
   assert.equal(next,true);
   ctx.opened++;
   nodes.graphicsPanel.classList.remove('hidden');
   ctx.setGraphicsSettingsScreen('visual');
  }
 };
 vm.runInNewContext(functions,ctx,{timeout:1000});
 ctx.setGraphicsSettingsScreen(screen);
 return {ctx,nodes,report};
}
test('a blocked download from closed graphics settings exposes actual visible benchmark JSON',()=>{
 const {ctx,nodes,report}=fixture();
 assert.equal(ctx.revealBenchmarkJson(true),true);
 assert.equal(ctx.opened,1);
 assert.equal(nodes.graphicsPanel.classList.contains('hidden'),false);
 assert.equal(nodes.graphicsBenchmarkPage.classList.contains('hidden'),false);
 assert.equal(nodes.graphicsVisualPage.classList.contains('hidden'),true);
 assert.equal(nodes.graphicsControlsPage.classList.contains('hidden'),true);
 assert.equal(nodes.graphicsTabBenchmark.attributes['aria-selected'],'true');
 assert.equal(nodes.graphicsTabBenchmark.tabIndex,0);
 assert.equal(ctx.active,'benchmarkRawJson');
 assert.equal(ctx.selected,'benchmarkRawJson');
 assert.equal(nodes.benchmarkRawJson.classList.contains('hidden'),false);
 assert.deepEqual(JSON.parse(nodes.benchmarkRawJson.value),report);
 assert.match(nodes.benchmarkExportHelp.textContent,/차단/);
 assert.equal(ctx.pausedWorldSteps,0);
});
test('JSON copy from an already-open visual/controls page switches to bounded benchmark page',()=>{
 for(const screen of ['visual','controls']){
  const {ctx,nodes}=fixture({open:true,screen,reason:'manual',frames:26});
  assert.equal(ctx.revealBenchmarkJson(),true);
  assert.equal(ctx.opened,0);
  assert.equal(nodes.graphicsBenchmarkPage.classList.contains('hidden'),false);
  assert.equal(nodes.graphicsVisualPage.classList.contains('hidden'),true);
  assert.equal(nodes.graphicsControlsPage.classList.contains('hidden'),true);
  assert.equal(ctx.active,'benchmarkRawJson');
  assert.match(nodes.benchmarkExportHelp.textContent,/JSON/);
 }
});
test('unfinished or insufficient benchmark cannot expose a fabricated copy',()=>{
 for(const options of [{state:'running',frames:150},{state:'finished',frames:1}]){
  const {ctx,nodes}=fixture(options);
  assert.equal(ctx.revealBenchmarkJson(true),false);
  assert.equal(ctx.opened,0);
  assert.equal(nodes.graphicsPanel.classList.contains('hidden'),true);
  assert.equal(nodes.benchmarkRawJson.classList.contains('hidden'),true);
  assert.equal(ctx.active,null);
 }
});
