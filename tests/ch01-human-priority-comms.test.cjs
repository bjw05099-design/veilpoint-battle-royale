'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { briefing } = require('../src/story-comms.js');

test('witnessed civilian arrival takes priority over optional archive records', () => {
 const state = {phase:'records',found:['recordA','recordB'],civilianRerouted:true,
  civilianWalker:{arrived:true,x:2,z:3},world:{player:{x:3,z:3}}};
 const radio=briefing(state);
 assert.match(radio.message,/주민/);
 assert.doesNotMatch(radio.message,/04:12|04:07/);
});

test('archival context never orders a second document pickup', () => {
 for(const found of [['recordA'],['recordB']]){
  const radio=briefing({phase:'decision',found});
  assert.doesNotMatch(radio.message,/직접 대조해야|보기 전에는/);
 }
});

test('unwitnessed arrival does not produce omniscient report', () => {
 const state={phase:'records',found:[],civilianRerouted:true,
  civilianWalker:{arrived:true,x:200,z:200},world:{player:{x:0,z:0}}};
 assert.doesNotMatch(briefing(state).message,/실제로 도착한 것을 봤다/);
});
