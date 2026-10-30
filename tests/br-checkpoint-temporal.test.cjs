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

test('BR resume rejects rival reload timers with a loaded magazine or no reserve', () => {
  corrupted(saved => { saved.bots[0].reloadRemaining = 0.5; });
  corrupted(saved => {
    saved.bots[0].loaded = 0;
    saved.bots[0].charges = 0;
    saved.bots[0].reloadRemaining = 0.5;
  });
  corrupted(saved => {
    saved.bots[0].loaded = 1;
    saved.bots[0].charges = 2;
    saved.bots[0].reloadRemaining = 0.5;
  });
});

test('BR checkpoint writer refuses impossible rival reload states before storage', () => {
  for (const invalid of [
    bot => { bot.reloadRemaining = 0.5; },
    bot => { bot.loaded = 0; bot.charges = 0; bot.reloadRemaining = 0.5; },
    bot => { bot.loaded = 1; bot.charges = 2; bot.reloadRemaining = 0.5; }
  ]) {
    const game = active();
    invalid(game.bots[0]);
    assert.throws(() => Sim.snapshotMatch(game), /Invalid BR checkpoint timing/);
  }
});

test('BR writer refuses contradictory actor state before replacing a valid autosave', () => {
  for (const invalid of [
    game => { game.player.alive = false; },
    game => { game.bots[0].health = 0; },
    game => { game.bots[0].charges = 0; game.bots[0].loaded = 1; },
    game => { game.kills = 1; }
  ]) {
    const game = active();
    invalid(game);
    assert.throws(() => Sim.snapshotMatch(game), /Invalid BR checkpoint actor state/);
  }
  const legitimate = active();
  legitimate.bots[0].health = 0;
  legitimate.bots[0].alive = false;
  assert.doesNotThrow(() => Sim.restoreMatch(Sim.snapshotMatch(legitimate)),
    'a rival can be eliminated without awarding the player a kill');
});

test('valid rival finite reload survives checkpoint and fixed-60Hz replay', () => {
  const original = active();
  const bot = original.bots[0];
  bot.loaded = 0;
  bot.charges = 2;
  bot.reloadRemaining = 1.2;
  const saved = Sim.snapshotMatch(original);
  const resumed = Sim.restoreMatch(saved);
  assert.equal(Sim.snapshotMatch(resumed), saved);
  for (let i = 0; i < 180; i++) {
    Sim.tick(original, 1 / 60, {});
    Sim.tick(resumed, 1 / 60, {});
    if (original.status !== 'playing') break;
    assert.equal(Sim.snapshotMatch(resumed), Sim.snapshotMatch(original));
  }
  assert.ok(resumed.bots[0].charges <= 2, 'restored reload never creates reserve ammunition');
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
