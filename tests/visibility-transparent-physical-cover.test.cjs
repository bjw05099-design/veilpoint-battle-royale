'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const visibility=require('../src/visibility.js');
function state(blocksSight){return {scene:'nahrin',player:{x:0,z:0,yaw:0},zone:{},bots:[],loot:[],effects:[],obstacles:[{x:0,z:-5,w:8,d:1,blocksSight}],guide:{x:0,z:-10}};}
test('transparent physical obstacle does not conceal visible CH01 guide',()=>{assert.equal(visibility.planVisible(state(false)).guides.length,1);});
test('solid physical obstacle still conceals CH01 guide',()=>{assert.equal(visibility.planVisible(state(true)).guides.length,0);assert.equal(visibility.planVisible(state(undefined)).guides.length,0);});
