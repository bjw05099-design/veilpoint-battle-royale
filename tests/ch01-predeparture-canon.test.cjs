'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Story = require('../src/story-slice.js');

test('CH01 begins after the Korean briefing, with unexpected local escalation', () => {
  const state = Story.createState();
  assert.match(state.subtitle, /한국에서 출국하기 전에 받은 파견 지시/);
  assert.match(state.subtitle, /도착한 뒤 내전이 예상보다 빠르게 번졌/);
  assert.match(state.subtitle, /귀환 경로도 불확실/);
  assert.doesNotMatch(state.subtitle, /현지에서.*최초 파견 지시서/);
  assert.equal(state.deploymentReviewed, false);
});

test('obsolete on-site deployment document never blocks a restored CH01 objective', () => {
  const original = Story.createState();
  const raw = Story.serialize(original);
  const snapshot = JSON.parse(raw);
  assert.equal(snapshot.deploymentReviewed, false);
  const legacy = {...snapshot, deploymentReviewed: true};
  const restored = Story.restore(JSON.stringify(legacy));
  const fresh = Story.restore(raw);
  assert.equal(Story.objective(restored), Story.objective(fresh));
  assert.equal(restored.deploymentReviewed, true);
  assert.equal(fresh.deploymentReviewed, false);
  assert.equal(Story.serialize(restored).includes('"deploymentReviewed":true'), true);
});
