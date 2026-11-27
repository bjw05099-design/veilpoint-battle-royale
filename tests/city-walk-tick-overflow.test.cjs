'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const walk=require('../src/aden-city-walking-probe.js');

test('60Hz civilian walk refuses a tick that would overflow its safe integer clock',()=>{
 const state={version:1,tick:Number.MAX_SAFE_INTEGER,x:0,z:0,y:0,blocked:false};
 assert.throws(()=>walk.step(null,state,{east:0,south:0}),/Invalid temporary civilian walk state/);
 assert.throws(()=>walk.step(null,{...state,tick:Number.MAX_SAFE_INTEGER+1},{}),/Invalid temporary civilian walk state/);
});
