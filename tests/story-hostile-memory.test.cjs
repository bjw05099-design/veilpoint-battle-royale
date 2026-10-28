'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const story = require('../src/story-slice.js');

function engage(){
  const s=story.createState();
  s.world.player.x=story.POINTS.terminal.x;
  s.world.player.z=story.POINTS.terminal.z;
  assert.equal(story.interact(s).ok,true);
  return s;
}
function cover(s){
  // An authored opaque obstacle between the opponent and the last seen spot.
  s.world.obstacles.push({x:0,z:-23,w:8,d:1,h:2,type:'cover'});
}
test('CH01 opponent investigates only a recently observed position and never fires through cover',()=>{
  const s=engage(),b=s.world.bots[0];
  story.step(s,1/60,{});
  assert.ok(b.investigateUntil>s.world.elapsed);
  assert.equal(b.lastSeenZ,s.world.player.z);
  const observed=b.lastSeenZ;
  cover(s);
  s.world.player.z=-12; // Unseen movement must not update the opponent's memory.
  b.angle=0;
  const initialAngle=b.angle;
  for(let i=0;i<60;i++)story.step(s,1/60,{});
  assert.equal(b.lastSeenZ,observed);
  assert.ok(b.angle>initialAngle,'bounded investigation turns toward last seen location');
  assert.equal(b.shots,0,'solid cover blocks every hostile shot');
  for(let i=0;i<180;i++)story.step(s,1/60,{});
  assert.ok(s.world.elapsed>=b.investigateUntil);
  const angleAfterExpiry=b.angle;
  for(let i=0;i<30;i++)story.step(s,1/60,{});
  assert.equal(b.angle,angleAfterExpiry,'memory expiry ends search until sight returns');
  assert.equal(b.shots,0);
});
test('CH01 last-seen memory survives checkpoint and preserves 60Hz replay under cover',()=>{
  const a=engage();
  story.step(a,1/60,{});
  cover(a);
  a.world.player.z=-12;
  const raw=story.serialize(a);
  const b=story.restore(raw);
  assert.equal(story.serialize(b),raw);
  cover(b);
  for(let i=0;i<120;i++){story.step(a,1/60,{});story.step(b,1/60,{});}
  assert.deepEqual(a.world.bots.map(h=>[h.x,h.z,h.angle,h.lastSeenX,h.lastSeenZ,h.investigateUntil,h.shots]),
    b.world.bots.map(h=>[h.x,h.z,h.angle,h.lastSeenX,h.lastSeenZ,h.investigateUntil,h.shots]));
  const corrupted=JSON.parse(raw);
  corrupted.combat.drones[0].investigateUntil=corrupted.elapsed+100;
  assert.throws(()=>story.restore(JSON.stringify(corrupted)),RangeError);
  corrupted.combat.drones[0].investigateUntil=a.world.elapsed;
  delete corrupted.combat.drones[0].lastSeenZ;
  assert.throws(()=>story.restore(JSON.stringify(corrupted)),RangeError);
});
test('CH01 old v2 opponent checkpoints migrate without fabricated memories',()=>{
  const a=engage();
  const old=JSON.parse(story.serialize(a));
  for(const b of old.combat.drones){
    delete b.lastSeenX;delete b.lastSeenZ;delete b.investigateUntil;
  }
  const restored=story.restore(JSON.stringify(old));
  assert.ok(restored.world.bots.every(b=>b.investigateUntil===0));
  assert.equal(restored.world.bots.length,3);
});
