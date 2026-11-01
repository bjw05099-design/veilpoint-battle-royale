'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const Sim = require('../src/simulation.js');

// The centre ray crosses this solid cover. A target slightly to its right
// exposes a finite shoulder; one directly behind it remains fully concealed.
function encounter(targetX, seed = 92341) {
  const game = Sim.newMatch(seed, 1);
  game.status = 'playing';
  game.obstacles = [{x: 0, z: -5, w: 2, d: 2, h: 3, type: 'wall'}];
  game.player.x = targetX;
  game.player.z = -10;
  const opponent = game.bots[0];
  Object.assign(opponent, {x: 0, z: 0, angle: 0, moveTime: 999,
    actionTime: 999, lastSeenX: 0, lastSeenZ: 0, lastSeenUntil: 0});
  return game;
}

test('BR human opponent can see a finite exposed silhouette at a wall edge', () => {
  const game = encounter(2.0);
  const opponent = game.bots[0];
  assert.equal(Sim.lineBlocked(opponent.x, opponent.z,
    game.player.x, game.player.z, game.obstacles), true,
  'the old centre-only test would conceal the exposed target');
  Sim.tick(game, 1 / 60, {});
  assert.ok(opponent.lastSeenUntil > game.elapsed);
  assert.equal(opponent.lastSeenX, game.player.x);
  assert.equal(opponent.lastSeenZ, game.player.z);
  assert.equal(game.player.health, 100,
    'seeing an exposed silhouette must not bypass the physical shot ray');
});

test('BR full solid cover still prevents exact visual tracking', () => {
  const game = encounter(0);
  const opponent = game.bots[0];
  Sim.tick(game, 1 / 60, {});
  assert.equal(opponent.lastSeenUntil, 0);
  assert.equal(opponent.lastSeenX, 0);
  assert.equal(opponent.lastSeenZ, 0);
});

test('BR partial-cover sight is deterministic across identical 60Hz streams', () => {
  const a = encounter(2.0, 92342), b = encounter(2.0, 92342);
  for (let i = 0; i < 120; i++) {
    Sim.tick(a, 1 / 60, {});
    Sim.tick(b, 1 / 60, {});
    assert.deepEqual(a.bots, b.bots);
    assert.equal(a.random.getState(), b.random.getState());
    assert.equal(a.player.health, b.player.health);
  }
});

test('BR visible-edge opponent spends a finite round but cannot hit through solid cover', () => {
  const game = encounter(2.0, 92343);
  const opponent = game.bots[0];
  opponent.actionTime = 0;
  const before = opponent.charges;
  Sim.tick(game, 1 / 60, {});
  assert.equal(opponent.charges, before - 1,
    'a physically visible edge permits a bounded shot attempt');
  assert.equal(opponent.loaded, 11);
  assert.equal(game.player.health, 100,
    'the actual shot ray cannot penetrate a wall hiding the body centre');
  assert.equal(game.status, 'playing');
});
