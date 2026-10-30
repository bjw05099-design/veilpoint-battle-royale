'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const Sim = require('../src/simulation.js');

function active() {
  const game = Sim.newMatch(20261030, 2, 'carbine');
  game.status = 'playing';
  return game;
}
function corrupted(change) {
  const saved = JSON.parse(Sim.snapshotMatch(active()));
  change(saved);
  for (const value of [saved, JSON.stringify(saved)]) {
    assert.throws(() => Sim.restoreMatch(value), /Invalid BR checkpoint timing/);
  }
}

test('BR resume rejects future player fire cooldown that would soft-lock firing', () => {
  corrupted(saved => { saved.lastTagAt = saved.elapsed + 180; });
});

test('BR resume rejects fabricated future opponent memory beyond the 2.5-second sight window', () => {
  corrupted(saved => { saved.bots[0].lastSeenUntil = saved.elapsed + 300; });
});

test('BR resume rejects impossible reload durations and full-magazine reload locks', () => {
  corrupted(saved => { saved.player.loaded = 8; saved.player.reloadRemaining = 9; });
  corrupted(saved => { saved.player.reloadRemaining = 0.5; });
  corrupted(saved => {
    saved.player.loaded = 8;
    saved.player.charges = 8;
    saved.player.reloadRemaining = 0.5;
  });
});

test('BR checkpoint writer refuses impossible timers before saving a broken resume', () => {
  const futureShot = active();
  futureShot.lastTagAt = futureShot.elapsed + 200;
  assert.throws(() => Sim.snapshotMatch(futureShot), /Invalid BR checkpoint timing/);
  const futureSight = active();
  futureSight.bots[0].lastSeenUntil = futureSight.elapsed + 200;
  assert.throws(() => Sim.snapshotMatch(futureSight), /Invalid BR checkpoint timing/);
});

test('legitimate finite reload and fresh sight memory round-trip with identical 60Hz replay', () => {
  const original = active();
  original.player.loaded = 8;
  original.player.charges = 24;
  assert.equal(Sim.reload(original).ok, true);
  original.bots[0].lastSeenUntil = original.elapsed + 2.5;
  const saved = Sim.snapshotMatch(original);
  const resumed = Sim.restoreMatch(saved);
  assert.equal(Sim.snapshotMatch(resumed), saved);
  for (let i = 0; i < 180; i++) {
    Sim.tick(original, 1 / 60, {});
    Sim.tick(resumed, 1 / 60, {});
    if (original.status !== 'playing') break;
    assert.equal(Sim.snapshotMatch(resumed), Sim.snapshotMatch(original));
  }
});
