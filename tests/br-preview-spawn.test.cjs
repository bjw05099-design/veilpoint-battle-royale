'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Sim=require('../src/simulation.js');

function demo(seed){
  const state=Sim.newMatch(seed,1,'carbine',true);
  state.status='playing';
  return state;
}
const distance=p=>Math.hypot(p.x,p.z);

test('single-rival PC demo begins with one physical, reachable-distance opponent',()=>{
  for(let seed=20261104;seed<20261136;seed++){
    const game=demo(seed),rival=game.bots[0];
    assert.equal(game.bots.length,1);
    assert.ok(distance(rival)>36,'demonstration cannot spawn a rival on the player');
    assert.ok(distance(rival)<=65,'demonstration must not require a 150m opening search');
    assert.equal(Sim.blocked(rival.x,rival.z,2.4,game.obstacles),false);
    assert.equal(Sim.getAliveCount(game),2);
  }
});

test('bounded initial placement preserves exact fixed-60Hz checkpoints and world position',()=>{
  const game=demo(20261104);
  for(let i=0;i<140;i++)Sim.tick(game,1/60,{forward:i%17<5,right:i%19<4});
  const save=Sim.snapshotMatch(game),copy=Sim.restoreMatch(save);
  assert.equal(Sim.snapshotMatch(copy),save);
  for(let i=0;i<240;i++){
    const input={forward:i%9<4,back:i%13<2,crouch:i%11===0};
    Sim.tick(game,1/60,input);Sim.tick(copy,1/60,input);
    if(game.status!=='playing'||copy.status!=='playing')break;
    assert.equal(Sim.snapshotMatch(copy),Sim.snapshotMatch(game));
  }
});

test('existing older one-rival saves may legitimately resume farther from spawn',()=>{
  const game=demo(20261105);
  assert.equal(Sim.blocked(0,75,.85,game.obstacles),false);
  game.bots[0].x=0;game.bots[0].z=75;
  const before=Sim.snapshotMatch(game);
  const restored=Sim.restoreMatch(before);
  assert.equal(restored.bots[0].z,75);
  assert.equal(Sim.snapshotMatch(restored),before);
});

test('normal 4/18-rival rosters and zero-rival CH01 base remain distinct',()=>{
  for(const count of [0,1,4,18]){
    const a=Sim.newMatch(20261104,count),b=Sim.newMatch(20261104,count);
    assert.equal(a.bots.length,count);
    assert.deepEqual(a.bots,b.bots,'seeded opponent spawn is deterministic');
    assert.deepEqual(a.loot,b.loot,'finite cache generation does not change across replay');
  }
});
