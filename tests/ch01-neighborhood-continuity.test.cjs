'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {newContinuity,applyEvent,restoreContinuity}=require('../src/ch01-neighborhood-continuity.cjs');
test('a witnessed outage persists across checkpoint reconstruction',()=>{
 let s=applyEvent(newContinuity(),'arrival',['kim']);
 s=applyEvent(s,'power_loss',['kim','mara']);
 assert.equal(s.districtPower,false);
 assert.deepEqual(s.witnesses.mara,['power_loss']);
 assert.deepEqual(restoreContinuity(JSON.parse(JSON.stringify(s))),s);
 assert.equal(applyEvent(s,'power_loss',['other']),s);
});
test('events cannot leap over their actual causal predecessors',()=>{
 assert.throws(()=>applyEvent(newContinuity(),'departure'),/causal_precondition/);
 assert.throws(()=>restoreContinuity({sequence:['power_loss'],witnesses:{},districtPower:false}),/causal_precondition/);
});
