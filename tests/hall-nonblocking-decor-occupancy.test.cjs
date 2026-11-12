const test = require('node:test');
const assert = require('node:assert/strict');
const lights = require('../src/aden-hall-lights.js');

function world(extra = []) {
  return {
    scene: 'nahrin',
    relayRestored: true,
    player: { x: 28, z: 34 },
    obstacles: [
      ...lights.REQUIRED_WALL_IDS.map(id => ({
        id, type: 'story-public-hall-wall', x: 50, z: 50, w: 1, d: 1, h: 3
      })),
      ...extra
    ]
  };
}

test('hall occupancy ignores explicitly nonblocking decorative surfaces', () => {
  const decoration = { x: 28, z: 34, w: 3, d: 3, blocksMovement: false };
  assert.equal(lights.occupiedInterior(world([decoration])), true);
  assert.equal(lights.occupiedInterior(world([{...decoration, solid: false}])), true);
});

test('hall occupancy still rejects real solids and missing hall walls', () => {
  const solid = { x: 28, z: 34, w: 2, d: 2 };
  assert.equal(lights.occupiedInterior(world([solid])), false);
  assert.equal(lights.occupiedInterior(world([{...solid, blocksMovement: true}])), false);
  const absent = world();
  absent.obstacles.pop();
  assert.equal(lights.occupiedInterior(absent), false);
});

test('lighting relay never implies hall occupancy or changes collision', () => {
  const scene = world();
  assert.equal(lights.level(scene), 1);
  assert.equal(lights.occupiedInterior(scene), true);
  scene.relayRestored = false;
  assert.equal(lights.level(scene), 0);
  assert.equal(lights.occupiedInterior(scene), true);
});
