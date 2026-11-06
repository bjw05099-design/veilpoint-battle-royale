'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Desktop=require('../src/desktop-controls.js');

test('Ctrl/Alt/Meta OS chords are not PC gameplay commands; ordinary Shift remains playable',()=>{
 for(const key of ['ctrlKey','altKey','metaKey']){
  assert.equal(Desktop.isModifiedGameplayKey({code:'KeyR',[key]:true}),true,key);
  assert.equal(Desktop.isModifiedGameplayKey({code:'KeyG',[key]:true}),true,key);
 }
 assert.equal(Desktop.isModifiedGameplayKey({code:'ShiftLeft',shiftKey:true}),false);
 assert.equal(Desktop.isModifiedGameplayKey({code:'KeyW'}),false);
 assert.equal(Desktop.isModifiedGameplayKey(null),false);
});

test('CH01 and BR reject OS chords before dispatching remapped movement, shooting or menu shortcuts',()=>{
 for(const file of ['app.js','story-app.js']){
  const source=fs.readFileSync(path.resolve(__dirname,'../src',file),'utf8');
  const guard=source.indexOf('if(Desktop.isModifiedGameplayKey(e)){clearInput();return;}');
  const actions=source.indexOf('const action=Desktop.actionFor(e.code,desktopUi.get());',guard);
  const shortcut=source.indexOf('Desktop.isGameplayShortcut(e)',guard);
  assert.ok(guard>0,file+' needs the shared guard');
  assert.ok(actions>guard,file+' must reject chord before gameplay actions');
  assert.ok(shortcut>guard,file+' must reject chord before gameplay shortcut dispatch');
 }
});

test('remap capture cannot turn Ctrl+R into a plain reload binding',()=>{
 const source=fs.readFileSync(path.resolve(__dirname,'../src/desktop-controls.js'),'utf8');
 const capture=source.slice(source.indexOf('function captureKey(event){'),source.indexOf('function cancel(){'));
 assert.match(capture,/if\(isModifiedGameplayKey\(event\)\)return false/);
 assert.ok(capture.indexOf('isModifiedGameplayKey(event)')<capture.indexOf('event.preventDefault()'));
});
