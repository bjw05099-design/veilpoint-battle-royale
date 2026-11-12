'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Story=require('../src/story-consequences.js');
const E=Story.EVENTS;

test('CH01 causal events reject forged prior observations and missing local route',()=>{
 const start=Story.newTimeline();
 assert.throws(()=>Story.advance({...start,events:[E.ARRIVED,E.SAFE_ROUTE]},E.EXIT),/Invalid causal event history/);
 assert.throws(()=>Story.advance({...start,events:[E.ARRIVED,E.ARRIVED]},E.ESCALATION),/Invalid causal event history/);
 assert.throws(()=>Story.advance({...start,events:[E.ARRIVED],route:'harbor'},E.ESCALATION),/Invalid local route history/);
});
test('actual observed escalation and locally selected route remain restorable',()=>{
 let t=Story.newTimeline();
 for(const e of [E.ARRIVED,E.ESCALATION,E.CONTACT_LOST,E.LOCAL_GUIDE])t=Story.advance(t,e);
 t=Story.advance(t,E.SAFE_ROUTE,'courtyard');
 t=Story.advance(t,E.EXIT);
 assert.deepEqual(Story.restoreTimeline(JSON.parse(JSON.stringify(t))),t);
 assert.equal(Story.nextAvailable(t).includes(E.EXIT),false);
});
