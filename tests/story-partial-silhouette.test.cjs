'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const Story = require('../src/story-slice.js');
const Sim = require('../src/simulation.js');

function encounter(x, wall = true) {
  const state = Story.createState();
  state.world.player.x = Story.POINTS.terminal.x;
  state.world.player.z = Story.POINTS.terminal.z;
  assert.equal(Story.interact(state).ok, true);
  const [hostile, ...others] = state.world.bots;
  for (const other of others) {other.alive = false;other.health = 0;}
  state.world.player.x = x;
  state.world.player.z = -38;
  hostile.angle = 0; // Faces the player, ten fictional metres north.
  state.combat.nextPulseAt = state.world.elapsed;
  if (wall) state.world.obstacles.push({x: 0, z: -33, w: 2, d: 2, h: 3, type: 'cover'});
  return state;
}

test('CH01 sees a finite exposed shoulder without requiring centre-line sight', () => {
  const state = encounter(2);
  const hostile = state.world.bots[0];
  assert.equal(Sim.lineBlocked(hostile.x, hostile.z,
    state.world.player.x, state.world.player.z, state.world.obstacles), true,
  'the old centre-only test concealed this partially exposed player');
  Story.step(state, 1 / 60, {});
  assert.equal(hostile.shots, 1, 'an exposed silhouette permits a finite attempted volley');
  assert.equal(hostile.lastSeenX, state.world.player.x);
  assert.equal(hostile.lastSeenZ, state.world.player.z);
  assert.ok(hostile.investigateUntil > state.world.elapsed);
  assert.equal(state.world.effects.filter(e => e.type === 'hostile').length, 1);
});

test('CH01 fully covered player remains unseen and cannot trigger a volley', () => {
  const state = encounter(0);
  const hostile = state.world.bots[0];
  const initialHealth = state.world.player.health;
  Story.step(state, 1 / 60, {});
  assert.equal(hostile.shots, 0);
  assert.equal(hostile.investigateUntil, 0);
  assert.equal(state.world.player.health, initialHealth);
});

test('CH01 living human body also blocks all silhouette sight samples', () => {
  const state = encounter(0, false);
  const [observer, blocker, third] = state.world.bots;
  blocker.alive = true;
  blocker.health = 90;
  blocker.x = 0;
  blocker.z = -33;
  blocker.angle = 0;
  third.alive = false;
  third.health = 0;
  Story.step(state, 1 / 60, {});
  assert.equal(observer.shots, 0, 'another standing actor must not become transparent');
  assert.equal(observer.investigateUntil, 0);
});

test('CH01 partial-cover awareness stays deterministic across fixed 60Hz replay', () => {
  const a = encounter(2), b = encounter(2);
  for (let i = 0; i < 120; i++) {
    Story.step(a, 1 / 60, {});
    Story.step(b, 1 / 60, {});
    assert.deepEqual(a.world.bots, b.world.bots);
    assert.equal(a.world.player.health, b.world.player.health);
    assert.deepEqual(a.world.effects, b.world.effects);
  }
});
