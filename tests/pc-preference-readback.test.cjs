'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Controls=require('../src/desktop-controls.js');

function harness(storage){
 const nodes=new Map(),events=new Map();
 const document={
  getElementById(id){
   if(!nodes.has(id))nodes.set(id,{
    id,value:id==='desktopBindAction'?'fire':'',
    checked:false,textContent:'',disabled:false,
    addEventListener(name,fn){events.set(id+':'+name,fn);}
   });
   return nodes.get(id);
  }
 };
 let resets=0;
 const ui=Controls.attach(document,storage,()=>resets++);
 return {nodes,events,ui,emit:(id,name)=>events.get(id+':'+name)(),resets:()=>resets};
}
test('PC preferences require an exact committed localStorage generation',()=>{
 const values=new Map(),source=Controls.normalize({sensitivity:1.75});
 const storage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)};
 assert.equal(Controls.save(storage,source),true);
 assert.equal(Controls.load(storage).sensitivity,1.75);
 const silent={getItem:key=>values.get(key)||null,setItem(){}};
 assert.equal(Controls.save(silent,Controls.normalize({sensitivity:2.1})),false,
  'ignored setItem must not report settings saved');
 assert.equal(Controls.load(storage).sensitivity,1.75);
 const substituted={getItem(){return '{}';},setItem(){}};
 assert.equal(Controls.save(substituted,source),false,
  'another tab or adapter overwriting settings must not pass readback');
 assert.equal(Controls.save({setItem(){}},source),false,
  'write-only storage cannot guarantee restart persistence');
 assert.equal(Controls.save({getItem(){throw Error('denied');},setItem(){}},source),false);
});
test('PC remap remains playable in current tab but warns when disk silently discards the binding',()=>{
 const saved=JSON.stringify(Controls.normalize({}));
 const storage={getItem(){return saved;},setItem(){ /* intentionally ignored */ }};
 const h=harness(storage),button=h.nodes.get('desktopBindKey');
 h.emit('desktopBindKey','click');
 let prevented=0;
 const accepted=h.ui.captureKey({code:'KeyT',preventDefault(){prevented++;}});
 assert.equal(accepted,true);
 assert.equal(prevented,1);
 assert.equal(h.ui.get().bindings.fire,'KeyT');
 assert.equal(Controls.load(storage).bindings.fire,'Space',
  'a reload must not claim a silently discarded remap');
 assert.match(h.nodes.get('desktopBindStatus').textContent,/현재 탭에만 적용/);
 assert.equal(h.resets(),1,'rebind still releases any held movement input');
 h.emit('desktopReset','click');
 assert.equal(h.ui.get().bindings.fire,'Space');
 assert.match(h.nodes.get('desktopBindStatus').textContent,/현재 탭에만 적용/);
});
test('PC sensitivity and invert-Y changes warn when localStorage readback is refused',()=>{
 const storage={getItem(){throw Error('blocked');},setItem(){}};
 const h=harness(storage);
 const sensitivity=h.nodes.get('desktopSensitivity');
 sensitivity.value='2.25';h.emit('desktopSensitivity','change');
 assert.equal(h.ui.get().sensitivity,2.25);
 assert.match(h.nodes.get('desktopBindStatus').textContent,/현재 탭에만 적용/);
 const invert=h.nodes.get('desktopInvertY');
 invert.checked=true;h.emit('desktopInvertY','change');
 assert.equal(h.ui.get().invertY,true);
 assert.match(h.nodes.get('desktopBindStatus').textContent,/현재 탭에만 적용/);
});
test('PC remap reports verified saved status only when disk echoes the exact value',()=>{
 const data=new Map();
 const storage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)};
 const h=harness(storage);
 h.emit('desktopBindKey','click');
 assert.equal(h.ui.captureKey({code:'KeyT',preventDefault(){}}),true);
 assert.equal(h.ui.get().bindings.fire,'KeyT');
 assert.equal(Controls.load(storage).bindings.fire,'KeyT');
 assert.match(h.nodes.get('desktopBindStatus').textContent,/키 설정을 저장했습니다/);
 h.emit('desktopReset','click');
 assert.equal(Controls.load(storage).bindings.fire,'Space');
 assert.match(h.nodes.get('desktopBindStatus').textContent,/복원하고 저장/);
});
