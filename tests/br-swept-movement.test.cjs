const test=require('node:test');
const assert=require('node:assert/strict');
const Sim=require('../src/simulation.js');

test('fast actor cannot tunnel through thin cover in a single catch-up movement',()=>{
  const p={x:-5,z:0};
  Sim.moveEntity(p,120,0,0.1,[{x:0,z:0,w:0.3,d:12}],0.85);
  assert.ok(p.x < -0.85, 'actor must remain on approach side of thin wall');
  assert.equal(p.z,0);
});

test('swept movement slides along walls instead of crossing them',()=>{
  const p={x:-3,z:-3};
  Sim.moveEntity(p,40,40,0.2,[{x:0,z:0,w:0.4,d:20}],0.85);
  assert.ok(p.x < -0.85);
  assert.ok(p.z > -3, 'unobstructed tangential movement must continue');
});

test('identical swept inputs produce deterministic positions',()=>{
  const obstacles=[{x:0,z:0,w:0.2,d:20}];
  const run=()=>{const p={x:-3,z:0};for(let i=0;i<60;i++)Sim.moveEntity(p,12,3,1/60,obstacles);return p;};
  assert.deepEqual(run(),run());
});
