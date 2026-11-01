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
  assert.equal(b.health,20,'boundary ruling must not invent a physical injury');
  assert.equal(b.disqualified,true);
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


function beforeFinalDeadline(seed, opponents=1) {
  const g=S.newMatch(seed,opponents);
  g.status='playing';
  const finalStart=S.ZONE_PHASES.slice(0,-1).reduce((sum,p)=>sum+p.duration,0);
  const finalEnd=finalStart+S.ZONE_PHASES.at(-1).duration;
  g.elapsed=finalEnd-0.1;
  Object.assign(g.zone,S.phaseAt(g.elapsed));
  return g;
}

test('final published boundary expiry disqualifies player without fabricated injury',()=>{
  const g=beforeFinalDeadline(8110,1);
  g.player.x=5;g.player.z=0;
  g.bots[0].x=0;g.bots[0].z=0;
  const hp=g.player.health;
  S.tick(g,0.05,{});
  assert.equal(g.status,'playing','the published final grace period remains playable');
  assert.equal(g.player.health,hp);
  S.tick(g,0.05,{});
  S.tick(g,0.05,{});
  assert.equal(g.zone.phase,S.ZONE_PHASES.length-1);
  assert.equal(g.zone.phaseRemaining,0);
  assert.equal(g.status,'lost');
  assert.equal(g.player.alive,false);
  assert.equal(g.player.health,hp);
  assert.match(g.message,/DISQUALIFIED/);
});

test('final boundary deadline applies to rivals and permits a fair match win',()=>{
  const g=beforeFinalDeadline(8111,1);
  g.player.x=0;g.player.z=0;
  g.bots[0].x=5;g.bots[0].z=0;
  const hp=g.player.health;
  for(let i=0;i<3;i++)S.tick(g,0.05,{});
  assert.equal(g.zone.phaseRemaining,0);
  assert.equal(g.bots[0].alive,false);
  assert.equal(g.status,'won');
  assert.equal(g.player.health,hp);
});

test('after the final clock expires, leaving the boundary cannot stall the match',()=>{
  const g=beforeFinalDeadline(8112,1);
  g.player.x=0;g.player.z=0;
  g.bots[0].x=0;g.bots[0].z=1;
  for(let i=0;i<3;i++)S.tick(g,0.05,{});
  assert.equal(g.status,'playing');
  assert.equal(g.zone.phaseRemaining,0);
  const hp=g.player.health;
  g.player.x=5;
  S.tick(g,1/60,{});
  assert.equal(g.status,'lost');
  assert.equal(g.player.health,hp);
  assert.equal(g.player.alive,false);
});

test('final-boundary expiry is deterministic after a checkpoint restore',()=>{
  const g=beforeFinalDeadline(8113,1);
  g.player.x=5;g.player.z=0;
  g.bots[0].x=0;g.bots[0].z=0;
  const restored=S.restoreMatch(S.snapshotMatch(g));
  for(let i=0;i<3;i++){
    S.tick(g,0.05,{});
    S.tick(restored,0.05,{});
    assert.equal(g.status,restored.status);
    assert.equal(g.player.health,restored.player.health);
    assert.deepEqual(g.bots.map(b=>[b.alive,b.health]),
      restored.bots.map(b=>[b.alive,b.health]));
    if(g.status==='playing')assert.equal(S.snapshotMatch(g),S.snapshotMatch(restored));
  }
  assert.equal(g.status,'lost');
});


test('BR boundary-disqualified rival retains health across checkpoint and 60Hz replay',()=>{
  const g=beforeDeadline(8121,2),removed=g.bots[0],remaining=g.bots[1];
  g.player.x=0;g.player.z=0;
  removed.x=171;removed.z=0;removed.health=47;removed.actionTime=9;
  remaining.x=0;remaining.z=-25;remaining.actionTime=9;
  for(let i=0;i<3;i++)S.tick(g,0.05,{});
  assert.equal(g.status,'playing');
  assert.equal(removed.alive,false);
  assert.equal(removed.disqualified,true);
  assert.equal(removed.health,47);
  const saved=S.snapshotMatch(g),restored=S.restoreMatch(saved);
  assert.equal(restored.bots[0].health,47);
  assert.equal(restored.bots[0].alive,false);
  assert.equal(restored.bots[0].disqualified,true);
  assert.equal(S.snapshotMatch(restored),saved);
  for(let i=0;i<15;i++){
    S.tick(g,1/60,{});S.tick(restored,1/60,{});
    if(g.status!=='playing')break;
    assert.equal(S.snapshotMatch(restored),S.snapshotMatch(g));
  }
});

test('BR checkpoint rejects fabricated boundary flags but migrates earlier combat saves',()=>{
  const g=beforeDeadline(8122,2);
  const base=JSON.parse(S.snapshotMatch(g));
  const invalid=fn=>{
    const value=structuredClone(base);fn(value);
    assert.throws(()=>S.restoreMatch(value),RangeError);
  };
  invalid(s=>{s.bots[0].disqualified=true;});
  invalid(s=>{s.bots[0].disqualified='true';});
  invalid(s=>{s.bots[0].alive=false;s.bots[0].health=40;s.bots[0].disqualified=false;});
  const legacy=structuredClone(base);
  for(const bot of legacy.bots)delete bot.disqualified;
  legacy.bots[0].alive=false;legacy.bots[0].health=0;
  const restored=S.restoreMatch(legacy);
  assert.equal(restored.bots[0].disqualified,false);
  assert.equal(restored.bots[0].health,0);
});
