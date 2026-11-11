'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const campaign = require('../src/campaign.js');
test('observed pacing rejects finite inputs whose sum overflows', () => {
  assert.throws(() => campaign.reviewObservedPacing({combat:1e308,urgentMovementAndRescue:1e308,characterAndStory:1e308,exploration:1e308}), /overflow/);
});
test('ordinary measured pacing remains accurate', () => {
  const result = campaign.reviewObservedPacing({combat:50,urgentMovementAndRescue:20,characterAndStory:22,exploration:8});
  assert.equal(result.measuredSeconds, 100);
  assert.equal(result.observedPercent.combat, 50);
});
