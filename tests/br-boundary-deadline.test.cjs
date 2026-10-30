'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const S=require('../src/simulation.js');

function beforeDeadline(seed=8100, opponents=1) {
  const g=S.newMatch(seed,opponents);
  g.status='playing';
  g.elapsed=89.9;
  Object.assign(g.zone,S.phaseAt(g.elapsed));
  return g;
}

test('BR out-of-bounds player takes no supernatural health damage before published deadline',()=>{
  const g=beforeDeadline(8101,0);
  g.player.x=160;g.player.z=0;
  const health=g.player.health,stress=g.player.stress;
  S.tick(g,1/60,{});
  assert.equal(g.status,'won','zero-opponent match still follows its normal terminal rule');
  assert.equal(g.player.health,health);
  assert.equal(g.player.stress,stress);
});

test('BR player outside at phase transition is disqualified without fabricated injury',()=>{
  const g=beforeDeadline(8102,1);
  g.player.x=160;g.player.z=0;
  S.tick(g,0.05,{});
  assert.equal(g.status,'playing');
  assert.equal(g.player.health,100);
  S.tick(g,0.05,{});
  S.tick(g,0.05,{});
  assert.equal(g.zone.phase,1);
  assert.equal(g.status,'lost');
  assert.equal(g.player.alive,false);
  assert.equal(g.player.health,100);
  assert.match(g.message,/DISQUALIFIED/);
});

test('BR return inside published phase deadline avoids boundary disqualification',()=>{
  const g=beforeDeadline(8103,1);
  g.player.x=160;g.player.z=0;
  S.tick(g,0.05,{});
  g.player.x=0;g.player.z=0;
  S.tick(g,0.05,{});
  S.tick(g,0.05,{});
  assert.equal(g.zone.phase,1);
  assert.equal(g.player.alive,true);
  assert.equal(g.player.health,100);
});

test('BR rival outside retains health until deadline then cannot fire',()=>{
  const g=beforeDeadline(8104,1),b=g.bots[0];
  g.player.x=0;g.player.z=0;
  b.x=171;b.z=0;b.health=20;b.actionTime=0;
  S.tick(g,0.05,{});
  assert.equal(b.health,20);
  assert.equal(b.alive,true);
  S.tick(g,0.05,{});
  S.tick(g,0.05,{});
  assert.equal(b.alive,false);
  assert.equal(b.health,0);
  assert.equal(b.charges,36);
  assert.equal(g.player.health,100);
});

test('BR checkpoint before deadline preserves deterministic eligibility and health',()=>{
  const g=beforeDeadline(8105,1);
  g.player.x=160;g.player.z=0;
  const saved=S.snapshotMatch(g);
  const resumed=S.restoreMatch(saved);
  assert.equal(S.snapshotMatch(resumed),saved);
  for(let i=0;i<12;i++){
    S.tick(g,1/60,{});
    S.tick(resumed,1/60,{});
    assert.equal(g.status,resumed.status);
    assert.equal(g.player.health,resumed.player.health);
    assert.equal(g.player.alive,resumed.player.alive);
    assert.deepEqual(g.bots.map(b=>[b.alive,b.health]),resumed.bots.map(b=>[b.alive,b.health]));
    if(g.status!=='playing')break;
    assert.equal(S.snapshotMatch(g),S.snapshotMatch(resumed));
  }
  assert.equal(g.status,'lost');
  assert.equal(g.player.health,100);
});
