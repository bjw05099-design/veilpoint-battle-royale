'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Desktop=require('../src/desktop-controls.js');
const br=fs.readFileSync(path.join(__dirname,'../src/app.js'),'utf8');
const story=fs.readFileSync(path.join(__dirname,'../src/story-app.js'),'utf8');

test('PC menu hotkeys preserve native text, file and preset selector typing',()=>{
 for(const tagName of ['INPUT','TEXTAREA','SELECT','input','select']){
  assert.equal(Desktop.isTextEntryTarget({tagName}),true,tagName);
 }
 assert.equal(Desktop.isTextEntryTarget({tagName:'BUTTON'}),false,
  'G still closes from a focused ordinary menu button');
 assert.equal(Desktop.isTextEntryTarget({tagName:'CANVAS'}),false);
 assert.equal(Desktop.isTextEntryTarget(null),false);
});
test('nested editor nodes, shadow children and ARIA comboboxes keep keyboard focus',()=>{
 const select={tagName:'SELECT'};
 assert.equal(Desktop.isTextEntryTarget({tagName:'OPTION',parentElement:select}),true);
 const editor={tagName:'DIV',getAttribute:k=>k==='contenteditable'?'plaintext-only':null};
 assert.equal(Desktop.isTextEntryTarget({tagName:'SPAN',parentNode:editor}),true);
 const combobox={tagName:'DIV',getAttribute:k=>k==='role'?'combobox':null};
 const root={host:combobox};
 assert.equal(Desktop.isTextEntryTarget({tagName:'SPAN',parentNode:root}),true);
 assert.equal(Desktop.isTextEntryTarget({tagName:'DIV',role:'searchbox'}),true);
});
test('malformed or cyclic event targets cannot trap the PC keyboard guard',()=>{
 const loop={tagName:'DIV',getAttribute:()=>undefined};
 loop.parentNode=loop;
 assert.equal(Desktop.isTextEntryTarget(loop),false);
 let ancestor={tagName:'BUTTON'};
 for(let i=0;i<40;i++)ancestor={tagName:'SPAN',parentNode:ancestor};
 assert.equal(Desktop.isTextEntryTarget(ancestor),false,'lookups are bounded');
});
test('BR G shortcut does not close settings from a focused preset selector',()=>{
 const start=br.indexOf('// G closes settings from ordinary buttons');
 const end=br.indexOf('// Menu/settings focus must never start a match',start);
 assert.ok(start>0&&end>start,'PC settings key handler missing');
 assert.match(br.slice(start,end),/e\.code==='KeyG'[\s\S]*?!Desktop\.isTextEntryTarget\(e\.target\)/);
 assert.match(br.slice(end,end+260),/Desktop\.isInteractiveTarget\(e\.target\)/);
});
test('CH01 global G/J shortcuts yield to the same PC editing target guard',()=>{
 const start=story.indexOf('// Typing JSON or changing a PC setting');
 const end=story.indexOf('// J opens the field journal',start);
 assert.ok(start>0&&end>start);
 assert.match(story.slice(start,end),/e\.code==='KeyJ'[\s\S]*?e\.code==='KeyG'[\s\S]*?Desktop\.isTextEntryTarget\(e\.target\)/);
});
