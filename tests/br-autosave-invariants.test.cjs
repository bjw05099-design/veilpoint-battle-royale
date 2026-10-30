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

test('BR writer refuses malformed metadata before replacing a valid local checkpoint', () => {
  const valid = Sim.snapshotMatch(active());
  assert.equal(Sim.snapshotMatch(Sim.restoreMatch(valid)), valid);
  for (const corrupt of [
    g => {g.seed = -1;},
    g => {g.kills = 1.5;},
    g => {g.message = 'X'.repeat(121);},
    g => {g.message = null;},
    g => {g.messageTime = Infinity;},
    g => {g.damageFlash = NaN;},
    g => {g.recentDamage = 101;},
    g => {g.random.getState = () => 0;},
    g => {g.effects = new Array(257).fill({x:0,z:0,t:0.2,type:'hit'});}
  ]) {
    const game = active();
    corrupt(game);
    assert.throws(() => Sim.snapshotMatch(game), RangeError);
  }
});

test('BR writer refuses unsupported or corrupt visual effects without losing a prior save', () => {
  for (const effect of [
    {x:0,z:0,t:0.2,type:'shield'},
    {x:0,z:0,t:Infinity,type:'hit'},
    {x:999,z:0,t:0.2,type:'hostile'}
  ]) {
    const game = active();
    game.effects.push(effect);
    assert.throws(() => Sim.snapshotMatch(game), RangeError);
  }
  const game = active();
  game.effects.push({x:0,z:0,t:0.2,type:'hit'});
  assert.deepEqual(Sim.restoreMatch(Sim.snapshotMatch(game)).effects, game.effects);
});

test('BR writer rejects non-boolean flags that would silently change after resume', () => {
  for (const corrupt of [
    g => {g.player.alive = 1;},
    g => {g.player.reloadAssist = 'false';},
    g => {g.player.reloadHesitation = 1;},
    g => {g.player.sprintExhausted = null;},
    g => {g.bots[0].alive = 1;},
    g => {g.loot[0].picked = 0;}
  ]) {
    const game = active();
    corrupt(game);
    assert.throws(() => Sim.snapshotMatch(game), RangeError);
  }
});
