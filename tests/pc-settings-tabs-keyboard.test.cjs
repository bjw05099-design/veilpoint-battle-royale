'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../src/app.js'),'utf8');
const start=source.indexOf('function setGraphicsSettingsScreen(');
const end=source.indexOf('function visibleGraphicsDialogControls(',start);
assert.ok(start>=0&&end>start,'settings keyboard controller must exist');
function setup(){
 const elements=new Map();
 for(const id of ['graphicsVisualPage','graphicsControlsPage','graphicsBenchmarkPage',
  'graphicsTabVisual','graphicsTabControls','graphicsTabBenchmark']){
  const el={id,attributes:{},handlers:{},focused:false,tabIndex:-1,
   classList:{hidden:false,toggle(name,value){if(name==='hidden')this.hidden=value;}},
   setAttribute(name,value){this.attributes[name]=value;},
   addEventListener(name,handler){this.handlers[name]=handler;},
   focus(){el.focused=true;}};
  elements.set(id,el);
 }
 let cancels=0;
 const context={$:id=>elements.get(id),desktopUi:{cancel(){cancels++;}}};
 vm.runInNewContext(source.slice(start,end),context,{timeout:1000});
 return {elements,context,get cancels(){return cancels;}};
}
function press(f,id,key){
 let prevented=0,stopped=0;
 f.elements.get(id).handlers.keydown({key,preventDefault(){prevented++;},
  stopPropagation(){stopped++;}});
 return {prevented,stopped};
}
test('arrow keys wrap between bounded pages and transfer focus without resuming gameplay',()=>{
 const f=setup();
 assert.deepEqual(press(f,'graphicsTabVisual','ArrowLeft'),{prevented:1,stopped:1});
 assert.equal(f.elements.get('graphicsTabBenchmark').attributes['aria-selected'],'true');
 assert.equal(f.elements.get('graphicsTabBenchmark').focused,true);
 assert.equal(f.elements.get('graphicsVisualPage').classList.hidden,true);
 assert.equal(f.elements.get('graphicsBenchmarkPage').classList.hidden,false);
 assert.deepEqual(press(f,'graphicsTabBenchmark','ArrowRight'),{prevented:1,stopped:1});
 assert.equal(f.elements.get('graphicsTabVisual').attributes['aria-selected'],'true');
 assert.equal(f.elements.get('graphicsTabVisual').tabIndex,0);
 assert.equal(f.elements.get('graphicsTabBenchmark').tabIndex,-1);
});
test('Home/End choose first/last tab; other keys remain available to controls',()=>{
 const f=setup();
 assert.deepEqual(press(f,'graphicsTabControls','End'),{prevented:1,stopped:1});
 assert.equal(f.elements.get('graphicsTabBenchmark').attributes['aria-selected'],'true');
 assert.deepEqual(press(f,'graphicsTabBenchmark','Home'),{prevented:1,stopped:1});
 assert.equal(f.elements.get('graphicsTabVisual').attributes['aria-selected'],'true');
 assert.deepEqual(press(f,'graphicsTabVisual','Escape'),{prevented:0,stopped:0});
 assert.ok(f.cancels>=2,'leaving remapping screen cancels pending key capture');
});
