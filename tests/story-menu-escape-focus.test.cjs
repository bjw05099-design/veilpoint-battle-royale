'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Desktop=require('../src/desktop-controls.js');

test('CH01 Escape pauses a running PC game even with a focused menu button',()=>{
  const key={code:'Escape',repeat:false,target:{tagName:'BUTTON'}};
  assert.equal(Desktop.isInteractiveTarget(key.target),true);
  assert.equal(Desktop.pcMenuEscape(key,{running:true,mayResume:false}),'pause');
  assert.equal(Desktop.pcMenuEscape(key,{running:true,mayResume:true}),'pause');
});

test('CH01 Escape resumes an existing paused session with a focused button',()=>{
  const key={code:'Escape',repeat:false,target:{tagName:'BUTTON'}};
  assert.equal(Desktop.pcMenuEscape(key,{running:false,mayResume:true}),'resume');
  // The opening menu, completion screen and graphics recovery never resume.
  assert.equal(Desktop.pcMenuEscape(key,{running:false,mayResume:false}),'ignore');
});

test('Escape key repeat and unrelated keys cannot double-toggle pause or resume',()=>{
  const key={code:'Escape',repeat:true,target:{tagName:'BUTTON'}};
  assert.equal(Desktop.pcMenuEscape(key,{running:true,mayResume:true}),'ignore');
  assert.equal(Desktop.pcMenuEscape(key,{running:false,mayResume:true}),'ignore');
  assert.equal(Desktop.pcMenuEscape({code:'Space',repeat:false},{running:true,mayResume:true}),null);
  assert.equal(Desktop.pcMenuEscape(null,{running:true,mayResume:true}),null);
});

test('focused PC settings stay protected from regular gameplay shortcuts',()=>{
  assert.equal(Desktop.isInteractiveTarget({tagName:'INPUT'}),true);
  assert.equal(Desktop.isInteractiveTarget({tagName:'BUTTON'}),true);
  assert.equal(Desktop.pcMenuEscape({code:'KeyR',repeat:false},{running:true}),null);
});
