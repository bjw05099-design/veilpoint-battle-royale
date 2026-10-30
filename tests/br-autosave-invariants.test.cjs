'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const Sim = require('../src/simulation.js');

function active() {
  const game = Sim.newMatch(20261030, 3, 'carbine');
  game.status = 'playing';
  return game;
}

test('normal finite-ammo 60Hz BR state still saves and replays exactly', () => {
  const game = active();
  for (let i = 0; i < 60; i++) Sim.tick(game, 1 / 60, {forward: i < 30});
  const saved = Sim.snapshotMatch(game);
  const restored = Sim.restoreMatch(saved);
  assert.equal(Sim.snapshotMatch(restored), saved);
  for (let i = 0; i < 60; i++) {
    const input = {right: i < 20};
    Sim.tick(game, 1 / 60, input);
    Sim.tick(restored, 1 / 60, input);
    assert.equal(Sim.snapshotMatch(restored), Sim.snapshotMatch(game));
  }
});

test('autosave refuses invalid player magazine, reserve, class capacity and reload state', () => {
  for (const corrupt of [
    g => {g.player.charges = 0;g.player.loaded = 1;},
    g => {g.player.maxCharges -= 1;},
    g => {g.player.loaded = 13;},
    g => {g.player.reloadHesitation = true;},
    g => {g.player.x = -85;g.player.z = -76;}
  ]) {
    const game = active();
    corrupt(game);
    assert.throws(() => Sim.snapshotMatch(game), RangeError);
  }
});

test('autosave refuses malformed rival identities and actors embedded in cover', () => {
  for (const corrupt of [
    g => {g.bots[0].id = 2;},
    g => {g.bots[0].x = -85;g.bots[0].z = -76;}
  ]) {
    const game = active();
    corrupt(game);
    assert.throws(() => Sim.snapshotMatch(game), RangeError);
  }
});

test('autosave refuses contradictory or fabricated finite loot caches', () => {
  for (const corrupt of [
    g => {g.loot[0].id = 2;},
    g => {g.loot[0].picked = true;},
    g => {g.loot[0].remaining = 13;},
    g => {g.loot[1].kind = 'shield';},
    g => {g.loot[0].x = -85;g.loot[0].z = -76;}
  ]) {
    const game = active();
    corrupt(game);
    assert.throws(() => Sim.snapshotMatch(game), RangeError);
  }
});

test('autosave refuses an inconsistent zone phase or forged radius', () => {
  for (const corrupt of [
    g => {g.zone.radius -= 1;},
    g => {g.zone.phase = 1;},
    g => {g.zone.x = 5;},
    g => {g.elapsed = 3601;}
  ]) {
    const game = active();
    corrupt(game);
    assert.throws(() => Sim.snapshotMatch(game), RangeError);
  }
});
