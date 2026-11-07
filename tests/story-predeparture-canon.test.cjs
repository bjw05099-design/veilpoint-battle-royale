'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const story=require('../src/story-slice.js');

test('CH01 begins after a known Korea briefing, not with an unknown local deployment order',()=>{
  const state=story.createState();
  assert.match(state.subtitle,/한국에서 출국하기 전에 받은 파견 지시/);
  assert.match(state.subtitle,/도착한 뒤 내전이 예상보다 빠르게 번졌/);
  assert.doesNotMatch(state.subtitle,/내전 참전 명령|현지에서 최초 파견 지시서/);
  assert.equal(state.deploymentReviewed,false);
  assert.equal(Object.hasOwn(story.POINTS,'deploymentOrder'),false);
  assert.equal(story.markers(state).some(m=>/deployment|파견 지시서/.test(m.id+' '+m.label)),false);
});

test('predeparture mandate never requires collecting an order to use the relay',()=>{
  const state=story.createState();
  const p=story.POINTS.terminal;
  state.world.player.x=p.x;state.world.player.z=p.z;
  const result=story.interact(state);
  assert.equal(result.ok,true);
  assert.equal(result.phase,'engagement');
  assert.equal(state.deploymentReviewed,false);
});

test('legacy deploymentReviewed remains a save-compatible inert field',()=>{
  const state=story.createState();
  const saved=JSON.parse(story.serialize(state));
  assert.equal(Object.hasOwn(saved,'deploymentReviewed'),true);
  const loaded=story.restore(JSON.stringify(saved));
  assert.equal(loaded.phase,state.phase);
  assert.equal(loaded.deploymentReviewed,false);
  assert.equal(story.markers(loaded).some(m=>/deployment|파견 지시서/.test(m.id+' '+m.label)),false);
});
