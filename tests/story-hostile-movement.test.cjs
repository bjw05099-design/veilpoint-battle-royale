'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Story=require('../src/story-slice.js');
const start=()=>{const s=Story.createState();s.world.player.x=0;s.world.player.z=-18;
  assert.equal(Story.interact(s).ok,true);return s;};
test('CH01 visible hostiles approach only a short authored distance with deterministic 60Hz movement',()=>{
  const a=start(),b=start(),origin={...a.world.bots[1]};
  for(let i=0;i<120;i++){Story.step(a,1/60);Story.step(b,1/60);}
  const moved=a.world.bots[1];
  assert.ok(Math.hypot(moved.x-origin.x,moved.z-origin.z)>0.1);
  assert.ok(Math.hypot(moved.x-origin.x,moved.z-origin.z)<=6+1e-8);
  assert.deepEqual(a.world.bots.map(h=>[h.x,h.z,h.angle,h.shots]),
    b.world.bots.map(h=>[h.x,h.z,h.angle,h.shots]));
});
test('CH01 hostiles do not turn or approach from unseen rear or through solid cover',()=>{
  const s=start(),rear=s.world.bots[0],covered=s.world.bots[1];
  rear.angle=0;
  s.world.obstacles.push({x:7.5,z:-26,w:4,d:4,h:3,type:'cover'});
  const before=s.world.bots.map(h=>[h.x,h.z,h.angle]);
  for(let i=0;i<60;i++)Story.step(s,1/60);
  assert.deepEqual([rear.x,rear.z,rear.angle],before[0]);
  assert.deepEqual([covered.x,covered.z,covered.angle],before[1]);
});
test('CH01 moving opponent pose survives checkpoints; malformed positions cannot revive impossible enemies',()=>{
  const s=start();
  for(let i=0;i<60;i++)Story.step(s,1/60);
  const raw=Story.serialize(s),loaded=Story.restore(raw);
  assert.equal(Story.serialize(loaded),raw);
  assert.deepEqual(loaded.world.bots.map(h=>[h.x,h.z,h.angle]),s.world.bots.map(h=>[h.x,h.z,h.angle]));
  const bad=JSON.parse(raw);
  bad.combat.drones[1].x+=30;
  assert.throws(()=>Story.restore(JSON.stringify(bad)),RangeError);
  const partial=JSON.parse(raw);
  delete partial.combat.drones[1].angle;
  assert.throws(()=>Story.restore(JSON.stringify(partial)),RangeError);
  const legacy=JSON.parse(raw);
  for(const h of legacy.combat.drones){delete h.x;delete h.z;delete h.angle;}
  const migrated=Story.restore(JSON.stringify(legacy));
  assert.equal(migrated.world.bots[1].x,15);
  assert.ok(JSON.parse(Story.serialize(migrated)).combat.drones.every(h=>Number.isFinite(h.angle)));
});
