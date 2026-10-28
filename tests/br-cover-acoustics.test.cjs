'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Sim=require('../src/simulation.js');

function match(seed=551){
  const game=Sim.newMatch(seed,2);
  game.status='playing';
  for(const b of game.bots){
    b.moveTime=100;b.actionTime=100;b.lastSeenUntil=0;
    b.loaded=12;b.charges=36;
  }
  return game;
}

test('BR patrol sidesteps a real wall instead of remaining permanently stuck',()=>{
  const game=match();
  const [walker,other]=game.bots;
  // Building at (70,-78) occupies x=62.5..77.5, z=-91.5..-64.5.
  walker.x=61.5;walker.z=-78;walker.angle=Math.PI/2;
  other.x=80;other.z=-78;other.angle=Math.PI/2;
  for(let i=0;i<60;i++)Sim.tick(game,1/60);
  assert.ok(walker.z>-77.5,'blocked walker must advance along the obstacle edge');
  assert.ok(walker.x<62.5,'the walker must not phase through solid cover');
  assert.equal(walker.charges,36,'avoidance must not fire or replenish rounds');
});

test('BR rivals investigate only bounded audible footsteps, without psychic sight or shots',()=>{
  const game=match();
  const [listener,walker]=game.bots;
  listener.x=0;listener.z=80;listener.angle=0;
  walker.x=2;walker.z=80;walker.angle=0;
  Sim.tick(game,1/60);
  assert.equal(listener.lastSeenX,2);
  assert.equal(listener.lastSeenZ,80);
  assert.ok(listener.lastSeenUntil>game.elapsed);
  assert.equal(listener.charges,36,'sound alone cannot fire a shot');
  assert.equal(walker.charges,36);

  const distant=match();
  distant.bots[0].x=0;distant.bots[0].z=80;distant.bots[0].angle=0;
  distant.bots[1].x=6;distant.bots[1].z=80;distant.bots[1].angle=0;
  Sim.tick(distant,1/60);
  assert.equal(distant.bots[0].lastSeenUntil,0,'distant unseen footsteps must not be tracked');
});

test('BR avoidance and acoustic search remain deterministic at fixed 60Hz',()=>{
  const run=()=>{
    const game=match(991);
    game.bots[0].x=61.5;game.bots[0].z=-78;game.bots[0].angle=Math.PI/2;
    game.bots[1].x=80;game.bots[1].z=-78;game.bots[1].angle=Math.PI/2;
    for(let i=0;i<150;i++)Sim.tick(game,1/60);
    return JSON.parse(Sim.snapshotMatch(game));
  };
  assert.deepEqual(run(),run());
});
