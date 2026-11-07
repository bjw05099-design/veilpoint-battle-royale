'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const controls=require('../src/desktop-controls.js');

test('existing PC remaps survive introduction of three optional CH01 and BR commands',()=>{
 const legacy={...controls.DEFAULT_BINDINGS};
 delete legacy.headlamp;
 delete legacy.guidance;
 delete legacy.cacheMove;
 legacy.fire='KeyL';
 legacy.reload='KeyB';
 legacy.interact='KeyU';
 const storage=new Map([[controls.STORAGE_KEY,JSON.stringify({
  sensitivity:1.75,invertY:true,bindings:legacy
 })]]);
 const adapter={
  getItem:key=>storage.get(key)??null,
  setItem:(key,value)=>storage.set(key,value)
 };
 const restored=controls.load(adapter);
 assert.equal(restored.bindings.fire,'KeyL');
 assert.equal(restored.bindings.reload,'KeyB');
 assert.equal(restored.bindings.interact,'KeyU');
 assert.equal(restored.sensitivity,1.75);
 assert.equal(restored.invertY,true);
 assert.equal(new Set(Object.values(restored.bindings)).size,controls.ACTIONS.length);
 for(const action of ['headlamp','guidance','cacheMove']){
  assert.ok(typeof restored.bindings[action]==='string');
  assert.equal(controls.actionFor(restored.bindings[action],restored),action);
 }
 assert.equal(controls.save(adapter,restored),true);
 assert.deepEqual(controls.load(adapter),restored,
  'saved BR/CH01 PC bindings must survive a browser restart');
});

test('new optional key defaults do not displace a preexisting original action',()=>{
 const old={...controls.DEFAULT_BINDINGS};
 delete old.headlamp;
 delete old.guidance;
 delete old.cacheMove;
 old.support='KeyL';
 old.reload='KeyB';
 old.assist='KeyU';
 const result=controls.normalize({bindings:old});
 for(const action of ['support','reload','assist'])
  assert.equal(result.bindings[action],old[action]);
 assert.equal(new Set(Object.values(result.bindings)).size,controls.ACTIONS.length);
});
