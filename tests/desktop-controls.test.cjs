'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const C=require('../src/desktop-controls.js');
const store=new Map();
const storage={getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)};

test('desktop preferences default to existing keyboard and mouse feel',()=>{
 const p=C.load(storage);
 assert.equal(p.sensitivity,1);assert.equal(p.invertY,false);
 assert.equal(C.actionFor('KeyW',p),'forward');
 assert.equal(C.actionFor('Space',p),'fire');
 assert.ok(Math.abs(C.mouseDelta(100,10,p).yaw-.23)<1e-12);
 assert.equal(C.mouseDelta(100,10,p).pitch,-.0165);
});
test('shared controls persist across BR and story with finite sensitivity and invert-Y',()=>{
 const p=C.load(storage);p.sensitivity=2;p.invertY=true;
 assert.equal(C.save(storage,p),true);
 const loaded=C.load(storage);
 assert.equal(loaded.sensitivity,2);assert.equal(loaded.invertY,true);
 assert.ok(Math.abs(C.mouseDelta(100,10,loaded).yaw-.46)<1e-12);
 assert.equal(C.mouseDelta(100,10,loaded).pitch,.033);
});
test('binding updates preserve uniqueness and reject reserved/menu keys',()=>{
 const p=C.load(storage);
 const changed=C.bind(p,'reload','KeyT');
 assert.equal(changed.ok,true);assert.equal(C.actionFor('KeyT',changed.value),'reload');
 assert.equal(C.actionFor('KeyR',changed.value),null);
 assert.equal(C.bind(changed.value,'fire','KeyT').reason,'key-in-use');
 assert.equal(C.bind(changed.value,'fire','Escape').reason,'reserved-key');
 assert.equal(C.bind(changed.value,'__proto__','KeyZ').reason,'unknown-action');
 assert.equal(C.bind(changed.value,'fire','KeyG').reason,'reserved-key');
 assert.equal(C.save(storage,changed.value),true);
 assert.equal(C.actionFor('KeyT',C.load(storage)),'reload');
});
test('invalid or poisoned saved settings cannot create duplicate binds or NaN aim',()=>{
 store.set(C.STORAGE_KEY,JSON.stringify({sensitivity:999,invertY:'true',bindings:{...C.DEFAULT_BINDINGS,fire:'KeyE'}}));
 const p=C.load(storage);
 assert.equal(p.sensitivity,1);assert.equal(p.invertY,false);
 assert.equal(p.bindings.fire,'Space');
 assert.deepEqual(C.mouseDelta(Infinity,NaN,p),{yaw:0,pitch:0});
 store.set(C.STORAGE_KEY,'{bad json');assert.equal(C.load(storage).bindings.forward,'KeyW');
});
test('storage unavailable is nonfatal',()=>{
 const fail={getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}};
 assert.equal(C.load(fail).bindings.reload,'KeyR');
 assert.equal(C.save(fail,C.normalize({})),false);
});

test('PC UI focus excludes form controls and buttons from gameplay key handling',()=>{
 for(const tagName of ['INPUT','TEXTAREA','SELECT','BUTTON','select'])
  assert.equal(C.isInteractiveTarget({tagName}),true);
 assert.equal(C.isInteractiveTarget({tagName:'DIV',isContentEditable:true}),true);
 assert.equal(C.isInteractiveTarget({tagName:'CANVAS'}),false);
 assert.equal(C.isInteractiveTarget(null),false);
});

test('PC gameplay focus leaves the menu and prevents a hidden button owning Space',()=>{
 let active=null;
 const menu={blur(){if(active===menu)active=null;}};
 const canvas={tabIndex:-1,focus(options){assert.equal(options.preventScroll,true);active=canvas;}};
 const doc={get activeElement(){return active;}};
 active=menu;
 assert.equal(C.focusGameplay(doc,canvas),true);
 assert.equal(active,canvas);
 assert.equal(C.focusGameplay(doc,null),false);
 assert.equal(C.focusGameplay(doc,{focus(){throw Error('focus denied');}}),false);
});
