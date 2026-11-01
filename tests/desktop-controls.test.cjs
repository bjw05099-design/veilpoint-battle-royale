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

test('Windows PC detection covers modern and legacy browser platform fields',()=>{
 assert.equal(C.isWindowsPC({userAgentData:{platform:'Windows'}}),true);
 assert.equal(C.isWindowsPC({platform:'Win32'}),true);
 assert.equal(C.isWindowsPC({userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}),true);
 assert.equal(C.isWindowsPC({platform:'Linux x86_64'}),false);
 assert.equal(C.isWindowsPC({userAgentData:{platform:'Android'}}),false);
 assert.equal(C.isWindowsPC(undefined),false);
});

test('PC UI focus excludes form controls and buttons from gameplay key handling',()=>{
 for(const tagName of ['INPUT','TEXTAREA','SELECT','BUTTON','select'])
  assert.equal(C.isInteractiveTarget({tagName}),true);
 assert.equal(C.isInteractiveTarget({tagName:'DIV',isContentEditable:true}),true);
 assert.equal(C.isInteractiveTarget({tagName:'CANVAS'}),false);
 assert.equal(C.isInteractiveTarget(null),false);
});

test('nested PC menu and editable descendants never dispatch gameplay hotkeys',()=>{
 const button={tagName:'BUTTON'};
 const icon={tagName:'SPAN',parentElement:button};
 assert.equal(C.isInteractiveTarget(icon),true,'button icon inherits interactive focus');
 const editable={tagName:'DIV',isContentEditable:true};
 const child={tagName:'SPAN',parentElement:editable};
 const textNode={nodeType:3,parentNode:child};
 assert.equal(C.isInteractiveTarget(textNode),true,'nested editable text inherits protection');
 const select={tagName:'SELECT'};
 assert.equal(C.isInteractiveTarget({tagName:'OPTION',parentElement:select}),true);
 const shadowHost={tagName:'BUTTON'};
 const shadowRoot={host:shadowHost};
 assert.equal(C.isInteractiveTarget({tagName:'SPAN',parentNode:shadowRoot}),true,
  'shadow-root descendants inherit host button protection');
 assert.equal(C.isInteractiveTarget({tagName:'CANVAS',parentElement:{tagName:'MAIN'}}),false);
 const cyclic={tagName:'SPAN'};cyclic.parentNode=cyclic;
 assert.equal(C.isInteractiveTarget(cyclic),false,'malformed event target cannot loop');
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

test('PC keyboard and mouse held-fire sources are independent and reset on pause',()=>{
 const latch=C.createTriggerLatch();
 assert.equal(latch.held,false);
 assert.equal(latch.press('keyboard'),true);
 assert.equal(latch.press('mouse'),true);
 assert.equal(latch.release('keyboard'),true,'mouse remains held after key release');
 assert.equal(latch.release('mouse'),false);
 assert.equal(latch.press('mouse'),true);
 assert.equal(latch.press('keyboard'),true);
 assert.equal(latch.release('mouse'),true,'keyboard remains held after mouse release');
 latch.clear();
 assert.equal(latch.held,false,'pause/remap must discard all physical trigger sources');
 assert.equal(latch.press('unknown'),false,'unrecognized sources cannot latch firing');
});

test('PC raw mouse lock requests unadjusted movement and caches unsupported fallback',async()=>{
 const calls=[];
 const canvas={requestPointerLock(options){
  calls.push(options);
  if(options)return Promise.reject(Object.assign(new Error('raw unsupported'),{name:'NotSupportedError'}));
  return Promise.resolve();
 }};
 await C.requestPrecisionPointerLock(canvas);
 await C.requestPrecisionPointerLock(canvas);
 assert.deepEqual(calls,[{unadjustedMovement:true},undefined,undefined]);
});
test('PC raw mouse lock does not bypass permission denial',async()=>{
 const calls=[];
 const canvas={requestPointerLock(options){
  calls.push(options);
  return Promise.reject(Object.assign(new Error('denied'),{name:'NotAllowedError'}));
 }};
 await assert.rejects(C.requestPrecisionPointerLock(canvas),{name:'NotAllowedError'});
 assert.equal(calls.length,1,'do not retry a user-denied pointer lock');
});
test('a canceled PC lock request cannot reacquire a stale game canvas',async()=>{
 let wanted=true;
 const calls=[];
 const canvas={requestPointerLock(options){
  calls.push(options);
  if(options)return Promise.reject(Object.assign(new Error('unsupported'),{name:'NotSupportedError'}));
  return Promise.resolve();
 }};
 const attempt=C.requestPrecisionPointerLock(canvas,()=>wanted);
 wanted=false;
 await assert.rejects(attempt,/pointer_lock_superseded/);
 assert.equal(calls.length,1,'no fallback after pause or superseding resume');
});
test('older browsers with synchronous raw-option rejection use ordinary pointer lock',()=>{
 const calls=[];
 const canvas={requestPointerLock(options){
  calls.push(options);
  if(options)throw new TypeError('raw options unsupported');
 }};
 assert.equal(C.requestPrecisionPointerLock(canvas),undefined);
 assert.deepEqual(calls,[{unadjustedMovement:true},undefined]);
});

test('BR and CH01 PC controls apply cross-tab remaps, clear held inputs and reject unrelated storage events',()=>{
 const values=new Map();
 const localStorage={
  getItem:key=>values.get(key)??null,
  setItem:(key,value)=>values.set(key,value)
 };
 const nodes=new Map(),windowListeners=new Map();
 const document={
  defaultView:{addEventListener:(name,callback)=>windowListeners.set(name,callback)},
  getElementById(id){
   if(!nodes.has(id))nodes.set(id,{
    value:id==='desktopBindAction'?'fire':'',checked:false,textContent:'',
    listeners:{},
    addEventListener(name,callback){this.listeners[name]=callback;}
   });
   return nodes.get(id);
  }
 };
 let releases=0;
 const controls=C.attach(document,localStorage,()=>releases++);
 const notify=windowListeners.get('storage');
 assert.equal(typeof notify,'function');
 assert.equal(C.actionFor('Space',controls.get()),'fire');
 const changed=C.bind(C.normalize({}),'fire','KeyF').value;
 changed.sensitivity=2.25;
 changed.invertY=true;
 localStorage.setItem(C.STORAGE_KEY,JSON.stringify(changed));
 notify({key:C.STORAGE_KEY,storageArea:localStorage});
 assert.equal(releases,1,'remote remap must release held mouse and keyboard inputs');
 assert.equal(C.actionFor('KeyF',controls.get()),'fire');
 assert.equal(C.actionFor('Space',controls.get()),null);
 assert.equal(controls.get().sensitivity,2.25);
 assert.ok(Math.abs(C.mouseDelta(10,10,controls.get()).pitch-0.037125)<1e-12);
 assert.equal(nodes.get('desktopBindKey').textContent,'KeyF');
 notify({key:C.STORAGE_KEY,storageArea:localStorage});
 notify({key:'veilpoint.graphics',storageArea:localStorage});
 notify({key:C.STORAGE_KEY,storageArea:{}});
 assert.equal(releases,1,'duplicate and unrelated events must not interrupt gameplay');
 nodes.get('desktopBindKey').listeners.click();
 assert.match(nodes.get('desktopBindKey').textContent,/다음 키/);
 values.delete(C.STORAGE_KEY);
 notify({key:null,storageArea:localStorage});
 assert.equal(releases,2,'storage clear must reset controls and cancel pending remap');
 assert.equal(C.actionFor('Space',controls.get()),'fire');
 assert.equal(nodes.get('desktopBindKey').textContent,'Space');
 assert.equal(controls.get().sensitivity,1);
 assert.equal(controls.captureKey({code:'KeyT'}),false,'stale remap capture must be canceled');
});

test('PC pointer lock rejects a canceled request even after raw-input fallback was cached',async()=>{
 const calls=[];
 const canvas={requestPointerLock(options){
  calls.push(options);
  if(options)return Promise.reject(Object.assign(new Error('unsupported'),{name:'NotSupportedError'}));
  return Promise.resolve();
 }};
 await C.requestPrecisionPointerLock(canvas);
 assert.equal(calls.length,2);
 assert.throws(()=>C.requestPrecisionPointerLock(canvas,()=>false),/pointer_lock_superseded/);
 assert.equal(calls.length,2,'a canceled cached fallback must not call pointer lock');
});

test('PC pointer lock releases a late raw-input grant after the menu supersedes it',async()=>{
 let resolveLock,wanted=true,unlocks=0;
 const doc={pointerLockElement:null,exitPointerLock(){
  unlocks++;this.pointerLockElement=null;
 }};
 const canvas={ownerDocument:doc,requestPointerLock(){
  return new Promise(resolve=>{resolveLock=()=>{doc.pointerLockElement=canvas;resolve();};});
 }};
 const attempt=C.requestPrecisionPointerLock(canvas,()=>wanted);
 wanted=false;resolveLock();
 await assert.rejects(attempt,/pointer_lock_superseded/);
 assert.equal(unlocks,1);
 assert.equal(doc.pointerLockElement,null);
});

test('PC pointer lock releases a late ordinary-lock grant on a cached fallback',async()=>{
 let resolveLock,wanted=true,unlocks=0;
 const doc={pointerLockElement:null,exitPointerLock(){
  unlocks++;this.pointerLockElement=null;
 }};
 const canvas={ownerDocument:doc,requestPointerLock(options){
  if(options)return Promise.reject(Object.assign(new Error('unsupported'),{name:'NotSupportedError'}));
  return new Promise(resolve=>{resolveLock=()=>{doc.pointerLockElement=canvas;resolve();};});
 }};
 const first=C.requestPrecisionPointerLock(canvas);
 // The raw-input rejection and fallback run in successive promise jobs.
 for(let i=0;i<4&&!resolveLock;i++)await Promise.resolve();
 assert.equal(typeof resolveLock,'function','ordinary fallback must begin');
 resolveLock();await first;
 const attempt=C.requestPrecisionPointerLock(canvas,()=>wanted);
 wanted=false;resolveLock();
 await assert.rejects(attempt,/pointer_lock_superseded/);
 assert.equal(unlocks,1);
 assert.equal(doc.pointerLockElement,null);
});
