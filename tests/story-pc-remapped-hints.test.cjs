'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Controls=require('../src/desktop-controls.js');

test('CH01 default PC mission hints preserve truthful original keyboard actions',()=>{
 const binds=Controls.normalize({}).bindings;
 const authored='클릭/SPACE 발사 · Q 상황 보고 · E로 재개 · E를 누르세요 · E 누르 · R키 · R 재장전';
 assert.equal(Controls.storyHintText(authored,binds),authored);
 assert.equal(Controls.storyHintText(undefined,binds),'');
});

test('CH01 remapped PC trigger and action hints never advertise dead Space/R/E/Q keys',()=>{
 let current=Controls.normalize({});
 for(const [action,key] of [
  ['fire','KeyV'],['support','KeyP'],['reload','KeyT'],['interact','KeyY']
 ]){
  const result=Controls.bind(current,action,key);
  assert.equal(result.ok,true,'unique user binding '+action);
  current=result.value;
 }
 const message='무장 대치자 3명 · 클릭/SPACE 발사 · Q 상황 보고';
 const instructions='E로 동행 재개 · E를 눌러 확인 · E 누르 · R키 · R 재장전';
 assert.equal(Controls.storyHintText(message,current.bindings),
   '무장 대치자 3명 · 클릭/V 발사 · P 상황 보고');
 assert.equal(Controls.storyHintText(instructions,current.bindings),
   'Y로 동행 재개 · Y를 눌러 확인 · Y 누르 · T키 · T 재장전');
 assert.equal(Controls.actionFor('KeyV',current),'fire');
 assert.equal(Controls.actionFor('Space',current),null);
 const before=JSON.stringify(current);
 Controls.storyHintText(message,current.bindings);
 assert.equal(JSON.stringify(current),before,'HUD formatter must never modify controls or 60Hz world');
});

test('CH01 durable PC preferences and uncommon shortcut names stay readable on reload',()=>{
 let current=Controls.normalize({});
 for(const [action,key] of [['fire','Numpad8'],['headlamp','ShiftRight'],['guidance','Numpad5']]){
  const result=Controls.bind(current,action,key);assert.equal(result.ok,true);
  current=result.value;
 }
 let saved='';
 const storage={setItem(_key,value){saved=value;},getItem(){return saved;}};
 assert.equal(Controls.save(storage,current),true);
 const loaded=Controls.load(storage);
 assert.equal(Controls.storyHintText('SPACE 발사',loaded.bindings),'NUM 8 발사');
 assert.equal(Controls.keyLabel(loaded.bindings.headlamp),'SHIFT R');
 assert.equal(Controls.keyLabel(loaded.bindings.guidance),'NUM 5');
 assert.equal(Controls.actionFor('Numpad8',loaded),'fire');
 assert.equal(Controls.actionFor('Space',loaded),null);
});

test('Windows CH01 objective, subtitle, status and shortcut HUD use one live PC mapping',()=>{
 const app=fs.readFileSync(path.resolve(__dirname,'../src/story-app.js'),'utf8');
 assert.match(app,/const controlText=text=>Desktop\.storyHintText\(text,bindings\)/);
 assert.match(app,/\$\('objective'\)\.textContent=controlText\(Story\.objective\(state\)\)/);
 assert.match(app,/\$\('status'\)\.textContent=controlText\(state\.message\)/);
 assert.match(app,/\$\('subtitle'\)\.textContent=controlText\(state\.subtitle\)/);
 assert.match(app,/Desktop\.keyLabel\(bindings\.headlamp\)/);
 assert.match(app,/Desktop\.keyLabel\(bindings\.guidance\)/);
 assert.match(app,/const action=Desktop\.actionFor\(e\.code,desktopUi\.get\(\)\)/);
 assert.match(app,/Story\.step\(state,step,input\)/);
});
