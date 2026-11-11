'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Controls=require('../src/desktop-controls.js');

test('offline pointer movement remains finite when a restored profile is missing',()=>{
 for(const value of [null,undefined,{}, {sensitivity:NaN},{sensitivity:Infinity},{sensitivity:-2},{sensitivity:999}]){
  const delta=Controls.mouseDelta(120,-50,value);
  assert.deepEqual(delta,{yaw:120*.0023,pitch:50*.00165});
 }
});

test('valid remapped pointer sensitivity and inverted Y still work',()=>{
 assert.deepEqual(Controls.mouseDelta(100,100,{sensitivity:2,invertY:true}),
  {yaw:100*.0023*2,pitch:100*.00165*2});
 const zero=Controls.mouseDelta(NaN,Infinity,null);
 assert.deepEqual(zero,{yaw:0,pitch:0});
});
