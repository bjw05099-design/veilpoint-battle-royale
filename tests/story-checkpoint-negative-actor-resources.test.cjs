'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Recovery=require('../src/checkpoint-recovery.js');
const Story=require('../src/story-slice.js');

test('negative restored actor resources cannot enter the first fixed-step frame',()=>{
 const backup=Story.serialize(Story.createState());
 for(const field of ['health','stamina','charges']){
  const invalid=Story.createState();
  invalid.world.player[field]=-1;
  const result=Recovery.recover('primary',backup,(primary,secondary)=>
   primary===null?Story.recoverCheckpoint(null,secondary):{source:'primary',state:invalid});
  assert.equal(result.source,'backup',field);
  assert.equal(result.state.world.player[field]>=0,true);
 }
});

test('negative bot health is not accepted as playable checkpoint state',()=>{
 const baseline=Story.createState();
 const backup=Story.serialize(baseline);
 const invalid=Story.createState();
 assert.ok(invalid.world.bots.length>0);
 invalid.world.bots[0].health=-1;
 const restored=Recovery.recover('primary',backup,(primary,secondary)=>
  primary===null?Story.recoverCheckpoint(null,secondary):{source:'primary',state:invalid});
 assert.equal(restored.source,'backup');
 assert.equal(restored.state.world.bots[0].health>=0,true);
});
