'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Story=require('../src/story-slice.js');

test('CH01 finite headlamp warns exactly once on crossing 10% at 60Hz',()=>{
  const state=Story.createState();
  state.flashlightTicks=3601;
  assert.equal(Story.toggleFlashlight(state).ok,true);
  Story.step(state,1/60);
  assert.equal(state.flashlightTicks,3600);
  assert.match(state.message,/배터리 부족/);
  const subtitle=state.subtitle;
  Story.step(state,1/60);
  assert.equal(state.flashlightTicks,3599);
  assert.equal(state.subtitle,subtitle);
  assert.equal(Story.toggleFlashlight(state).on,false);
  const remaining=state.flashlightTicks;
  for(let i=0;i<60;i++)Story.step(state,1/60);
  assert.equal(state.flashlightTicks,remaining,'switching off preserves finite battery');
});

test('CH01 restored checkpoint does not repeat a crossed battery warning',()=>{
  const state=Story.createState();
  state.flashlightTicks=3599;
  assert.equal(Story.toggleFlashlight(state).ok,true);
  const restored=Story.restore(Story.serialize(state));
  restored.message='기존 안내';
  Story.step(restored,1/60);
  assert.equal(restored.message,'기존 안내');
  assert.equal(restored.flashlightTicks,3598);
});
