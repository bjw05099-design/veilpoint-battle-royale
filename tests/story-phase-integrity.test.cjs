'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const Story = require('../src/story-slice.js');

function combatCheckpoint() {
  const state = Story.createState();
  state.world.player.x = Story.POINTS.terminal.x;
  state.world.player.z = Story.POINTS.terminal.z;
  assert.equal(Story.interact(state).ok, true);
  assert.equal(state.phase, 'engagement');
  return JSON.parse(Story.serialize(state));
}

test('CH01 engagement save cannot import records from an uncleared future phase', () => {
  const valid = combatCheckpoint();
  assert.equal(Story.restore(JSON.stringify(valid)).phase, 'engagement');
  for (const found of [['recordA'], ['recordA', 'recordB']]) {
    const forged = {...valid, found};
    assert.throws(() => Story.restore(JSON.stringify(forged)), /Invalid checkpoint mission state/);
  }
});

test('CH01 combat save cannot pre-authorize either exit route', () => {
  const valid = combatCheckpoint();
  for (const choice of ['evacuation', 'verification']) {
    const forged = {...valid, choice,
      found: choice === 'verification' ? ['recordA', 'recordB'] : []};
    assert.throws(() => Story.restore(JSON.stringify(forged)), /Invalid checkpoint mission state/);
  }
});

test('CH01 failed encounter also rejects later evidence and route state', () => {
  const failed = combatCheckpoint();
  failed.phase = 'failed';
  failed.player.health = 0;
  assert.equal(Story.restore(JSON.stringify(failed)).phase, 'failed');
  assert.throws(() => Story.restore(JSON.stringify({...failed, found: ['recordB']})),
    /Invalid checkpoint mission state/);
  assert.throws(() => Story.restore(JSON.stringify({...failed, choice: 'evacuation'})),
    /Invalid checkpoint mission state/);
});

test('CH01 untouched combat checkpoint still round-trips and replays at 60Hz', () => {
  const raw = JSON.stringify(combatCheckpoint());
  const a = Story.restore(raw), b = Story.restore(raw);
  for (let i = 0; i < 120; i++) {
    Story.step(a, 1 / 60, {});
    Story.step(b, 1 / 60, {});
  }
  assert.equal(Story.serialize(a), Story.serialize(b));
});
