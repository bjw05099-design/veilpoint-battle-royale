'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Campaign = require('../src/campaign.js');
const Story = require('../src/story-slice.js');

test('CH01 briefing precedes arrival and escalation without a document pickup', () => {
  const beats = Campaign.ch01Causality();
  assert.deepEqual(beats.map(beat => beat.id), [
    'korea-briefing','harbor-arrival','unexpected-escalation','civilian-agency'
  ]);
  assert.equal(beats[0].location, 'korea');
  assert.ok(beats.every(beat => beat.requiresInteraction === false));
  assert.ok(beats[0].order < beats[1].order && beats[1].order < beats[2].order);
  const state = Story.createState();
  assert.equal(state.deploymentReviewed, false);
  assert.match(state.subtitle, /한국에서 출국하기 전에/);
  assert.match(state.subtitle, /내전이 예상보다 빠르게 번졌/);
  assert.ok(!Story.markers(state).some(marker => /deployment|firstOrder|initialDispatch/i.test(marker.id)));
});

test('predeparture correction does not add a save field or break legacy v2 checkpoint restoration', () => {
  const state = Story.createState();
  const saved = Story.serialize(state);
  const restored = Story.restore(saved);
  assert.equal(restored.phase, state.phase);
  assert.equal(restored.deploymentReviewed, false);
  assert.deepEqual(restored.found, state.found);
  assert.equal(restored.world.player.x, state.world.player.x);
  assert.equal(restored.world.player.z, state.world.player.z);
  assert.equal(Story.openingBeat(restored)?.location, 'korea');
});
