'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const story = require('../src/story-slice.js');

function engagementAt(playerZ) {
  const state = story.createState();
  const terminal = story.POINTS.terminal;
  state.world.player.x = terminal.x;
  state.world.player.z = terminal.z;
  assert.equal(story.interact(state).ok, true);
  assert.equal(state.phase, 'engagement');
  const [hostile, ...others] = state.world.bots;
  for (const other of others) {
    other.alive = false;
    other.health = 0;
  }
  state.world.player.x = hostile.x;
  state.world.player.z = playerZ;
  hostile.angle = Math.PI; // Directly faces the player in this controlled scenario.
  state.combat.nextPulseAt = state.world.elapsed;
  return state;
}

test('CH01 scheduled hostile volley requires the same 42m visual range as pursuit', () => {
  // Hostile #0 is at z=-28; at z=15 the player is 43m away.
  const state = engagementAt(15);
  const hostile = state.world.bots[0];
  const health = state.world.player.health;
  story.step(state, 1 / 60, {});
  assert.equal(hostile.shots, 0, 'an unseen player cannot be attacked at the old 48m threshold');
  assert.equal(state.world.player.health, health);
  assert.equal(state.world.effects.filter(effect => effect.type === 'hostile').length, 0);

  // A later real sighting inside 42m enables an actual finite shot.
  state.world.player.z = 12;
  state.combat.nextPulseAt = state.world.elapsed;
  story.step(state, 1 / 60, {});
  assert.equal(hostile.shots, 1);
  assert.equal(state.world.effects.filter(effect => effect.type === 'hostile').length, 1);
});

test('CH01 visual-range gate survives checkpoint restore and 60Hz replay', () => {
  const state = engagementAt(15);
  const resumed = story.restore(story.serialize(state));
  for (let i = 0; i < 120; i++) {
    story.step(state, 1 / 60, {});
    story.step(resumed, 1 / 60, {});
  }
  assert.equal(state.world.bots[0].shots, 0);
  assert.equal(story.serialize(resumed), story.serialize(state));

  for (const s of [state, resumed]) {
    s.world.player.z = 12;
    s.combat.nextPulseAt = s.world.elapsed;
  }
  for (let i = 0; i < 60; i++) {
    story.step(state, 1 / 60, {});
    story.step(resumed, 1 / 60, {});
  }
  assert.equal(state.world.bots[0].shots, 1);
  assert.equal(story.serialize(resumed), story.serialize(state));
});
