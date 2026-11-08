'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Nav=require('../src/navigation.js');
const Desktop=require('../src/desktop-controls.js');
const Story=require('../src/story-slice.js');
const app=fs.readFileSync(path.join(__dirname,'../src/story-app.js'),'utf8');
const start=app.indexOf("    if(action==='guidance'){");
const end=app.indexOf("    }\n  });",start);
assert.ok(start>=0&&end>start,'production guidance key handler must exist');
const handler=app.slice(start,end+6);
const markers=[
 {id:'exitEvac',x:0,z:-61,label:'안뜰'},
 {id:'guideControl',x:-4,z:-55,label:'안내원'},
 {id:'aidDrop',x:10,z:-52,label:'현장 인계'}
];
function fixture(published=markers){
 const updates=[],ctx={published,Navigation:Nav};
 const make=new Function('ctx',`const Navigation=ctx.Navigation;
   const Story={markers:()=>ctx.published};const state={};
   function visibleMissionMarkers(){return ctx.published;}
   let guidanceId=null,action='guidance';
   function updateHud(){ctx.updates.push(guidanceId);}
   return e=>{${handler};return guidanceId;};`);
 ctx.updates=updates;
 const run=make(ctx);
 const press=(shiftKey=false,repeat=false)=>run({shiftKey,repeat,
  prevented:0,preventDefault(){this.prevented++;}});
 return {ctx,press,updates};
}
test('PC Shift+N moves backward among public objectives and wraps to automatic guidance',()=>{
 const f=fixture();
 assert.equal(f.press(true),'aidDrop');
 assert.equal(f.press(true),'guideControl');
 assert.equal(f.press(true),'exitEvac');
 assert.equal(f.press(true),null);
 assert.deepEqual(f.updates,['aidDrop','guideControl','exitEvac',null]);
});
test('PC default N preserves forward order; Shift+N reverses the last navigation',()=>{
 const f=fixture();
 assert.equal(f.press(false),'exitEvac');
 assert.equal(f.press(false),'guideControl');
 assert.equal(f.press(true),'exitEvac');
 assert.equal(f.press(true),null);
 assert.equal(f.press(false),'exitEvac');
});
test('PC key auto-repeat is ignored without accidentally skipping multiple objectives',()=>{
 const f=fixture();
 assert.equal(f.press(false),'exitEvac');
 for(let i=0;i<40;i++)assert.equal(f.press(false,true),undefined,
  'a repeated key press exits before any guidance mutation');
 assert.deepEqual(f.updates,['exitEvac']);
 assert.equal(f.press(true),null,'reverse from first target returns to automatic');
 assert.equal(f.press(true),'aidDrop','reverse from automatic wraps to last target');
});
test('CH01 reverse selection remains tied to IDs when observed objectives appear or disappear',()=>{
 const f=fixture();
 f.press();f.press();
 const selection=f.ctx.published[1].id;
 assert.equal(selection,'guideControl');
 f.ctx.published=[markers[0],markers[2]];
 assert.equal(f.press(true),'aidDrop',
  'missing selected ID returns to last published objective without exposing hidden guide');
 f.ctx.published=markers;
 assert.equal(f.press(true),'guideControl');
});
test('remapped PC guidance key retains Shift reverse modifier and visible accessibility hint',()=>{
 const settings=Desktop.normalize({});
 const remapped=Desktop.normalize({...settings,
  bindings:{...settings.bindings,guidance:'KeyP'}});
 assert.equal(Desktop.actionFor('KeyP',remapped),'guidance');
 assert.match(app,/if\(e\.shiftKey\)\s*guidanceId=Navigation\.previousMarkerId/);
 assert.match(app,/if\(e\.repeat\)return/);
 assert.match(app,/Desktop\.keyLabel\(bindings\.guidance\)\+'\] 역순'/);
});
test('reverse mission marker cycling never mutates fixed-step mission state or marker data',()=>{
 const state=Story.createState();
 const original=JSON.stringify(state),published=Story.markers(state);
 const saved=JSON.stringify(published);
 let target=null;
 for(let i=0;i<80;i++)target=Nav.previousMarkerId(published,target);
 assert.equal(JSON.stringify(state),original);
 assert.equal(JSON.stringify(published),saved);
 assert.ok(target===null||published.some(x=>x.id===target));
});
