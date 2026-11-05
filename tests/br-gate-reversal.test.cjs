'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Sim=require('../src/simulation.js');
const STEP=1/60;
function start(seed=415){
  const game=Sim.newMatch(seed,1);
  game.status='playing';
  game.player.x=Sim.SERVICE_YARD.switchX;
  game.player.z=Sim.SERVICE_YARD.switchZ;
  return game;
}
function advance(game,frames){
  for(let i=0;i<frames;i++)Sim.tick(game,STEP,{});
}
test('BR E reverses a moving physical gate without resetting progress',()=>{
  const g=start();
  assert.equal(Sim.operateServiceGate(g).ok,true);
  advance(g,30);
  const at=Sim.serviceGateStatus(g).progress;
  assert.ok(at>0&&at<1);
  const reverse=Sim.operateServiceGate(g);
  assert.deepEqual({ok:reverse.ok,reversed:reverse.reversed,closing:reverse.closing},
    {ok:true,reversed:true,closing:true});
  assert.equal(g.yardGate.progress,at);
  advance(g,10);
  assert.ok(g.yardGate.progress<at);
  assert.equal(Sim.operateServiceGate(g).closing,false);
  advance(g,10);
  assert.ok(g.yardGate.progress>0);
});
test('BR gate reverse at 60Hz replays identically after checkpoint restore',()=>{
  const a=start(419);
  Sim.operateServiceGate(a);advance(a,42);
  const b=Sim.restoreMatch(Sim.snapshotMatch(a));
  assert.equal(Sim.operateServiceGate(a).closing,true);
  assert.equal(Sim.operateServiceGate(b).closing,true);
  advance(a,19);advance(b,19);
  assert.equal(Sim.snapshotMatch(a),Sim.snapshotMatch(b));
});
test('BR gate local control is unavailable from a distant player or ended match',()=>{
  const g=start();
  g.player.x=0;g.player.z=0;
  assert.equal(Sim.operateServiceGate(g).reason,'out_of_reach');
  assert.equal(g.yardGate.progress,0);
  g.status='lost';
  assert.equal(Sim.operateServiceGate(g).reason,'inactive');
});
test('BR gate never passes through a standing player on its rail',()=>{
  const g=start();
  Sim.operateServiceGate(g);
  g.player.x=Sim.SERVICE_YARD.x;
  g.player.z=Sim.SERVICE_YARD.z;
  advance(g,12);
  assert.equal(g.yardGate.progress,0);
});
