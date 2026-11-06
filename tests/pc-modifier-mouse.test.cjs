'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const Desktop=require('../src/desktop-controls.js');

function mouseHandler(file){
  const source=fs.readFileSync(path.resolve(__dirname,'../src',file),'utf8');
  const start=source.indexOf("canvas.addEventListener('mousedown',e=>{");
  const nextHandler=source.indexOf("addEventListener('mouseup',",start);
  const end=source.lastIndexOf('\n',nextHandler); // Exclude the 'global.' prefix in CH01.
  assert.ok(start>=0&&end>start,'target real mouse input handler for '+file);
  const snippet=source.slice(start,end);
  const stats={shots:0,presses:0,clears:0};
  const input={forward:true,fireHeld:true};
  const canvas={addEventListener(type,listener){assert.equal(type,'mousedown');this.listener=listener;}};
  const trigger={press(source){assert.equal(source,'mouse');stats.presses++;return true;}};
  const firearms={sample:{automatic:true}};
  const common={canvas,Desktop,document:{pointerLockElement:canvas},isTouch:false,canAct:()=>true,
   input,trigger,fire(){stats.shots++;},clearInput(){stats.clears++;input.forward=false;input.fireHeld=false;}};
  const context=file==='app.js'
    ?{...common,Game:{FIREARMS:firearms},simulation:{player:{weaponId:'sample'}}}
    :{...common,Sim:{FIREARMS:firearms},state:{world:{player:{weaponId:'sample'}}}};
  vm.runInNewContext(snippet,context,{timeout:1000});
  return {fireEvent:canvas.listener,stats,input,context};
}

for(const file of ['app.js','story-app.js']){
  test(file+' refuses modified PC mouse clicks without firing or latching 60Hz input',()=>{
    const h=mouseHandler(file);
    for(const name of ['ctrlKey','altKey','metaKey']){
      h.input.forward=true;
      h.input.fireHeld=true;
      h.fireEvent({button:0,[name]:true});
      assert.equal(h.stats.shots,0,name+' should not invoke fire');
      assert.equal(h.stats.presses,0,name+' should not hold automatic fire');
      assert.equal(h.input.forward,false,name+' should release held movement');
      assert.equal(h.input.fireHeld,false,name+' should release a prior held trigger');
    }
    assert.equal(h.stats.clears,3);
    h.fireEvent({button:0,shiftKey:true});
    assert.equal(h.stats.shots,1,'unmodified/Shift mouse input still works');
    assert.equal(h.stats.presses,1);
    assert.equal(h.input.fireHeld,true);
    h.context.document.pointerLockElement=null;
    h.fireEvent({button:0});
    assert.equal(h.stats.shots,1,'click without pointer lock must not drive the world');
  });
}

test('remapping a keyboard trigger never changes modified mouse blocking on BR/CH01',()=>{
  const mapped=Desktop.bind(Desktop.normalize({}),'fire','KeyV');
  assert.equal(mapped.ok,true);
  assert.equal(Desktop.actionFor('KeyV',mapped.value),'fire');
  assert.equal(Desktop.actionFor('Space',mapped.value),null);
  for(const file of ['app.js','story-app.js']){
    const h=mouseHandler(file);
    h.fireEvent({button:0,ctrlKey:true});
    assert.equal(h.stats.shots,0);
  }
});
