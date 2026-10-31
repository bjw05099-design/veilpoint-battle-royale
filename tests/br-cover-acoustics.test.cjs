'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Sim=require('../src/simulation.js');

function match(seed=551){
  const game=Sim.newMatch(seed,2);
  game.status='playing';
  for(const b of game.bots){
    b.moveTime=5;b.actionTime=5;b.lastSeenUntil=0;
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
  for(let i=0;i<60;i++){
    const x=walker.x,z=walker.z;
    Sim.tick(game,1/60);
    assert.ok(Math.hypot(walker.x-x,walker.z-z)<=1/60+1e-8,
      'cover avoidance cannot exceed the original walking-speed budget');
  }
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
  const resumed=Sim.restoreMatch(Sim.snapshotMatch(game));
  assert.equal(resumed.bots[0].lastSeenX,2,'checkpoint must preserve heard evidence');
  for(let i=0;i<90;i++){
    Sim.tick(game,1/60);Sim.tick(resumed,1/60);
    assert.deepEqual(JSON.parse(Sim.snapshotMatch(resumed)),JSON.parse(Sim.snapshotMatch(game)),
      'hearing and investigation must survive a deterministic resume');
  }

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


test('BR new audible player shot supersedes stale memory without hidden exact tracking',()=>{
  const game=Sim.newMatch(9921,1);game.status='playing';
  const listener=game.bots[0];
  game.player.x=1.3;game.player.z=0;game.player.yaw=Math.PI;
  listener.x=7;listener.z=0;listener.angle=0;
  listener.lastSeenX=40;listener.lastSeenZ=40;listener.lastSeenUntil=2.5;
  const rounds=game.player.charges;
  assert.equal(Sim.tag(game).ok,true);
  assert.equal(game.player.charges,rounds-1);
  assert.deepEqual([listener.lastSeenX,listener.lastSeenZ],[2,0]);
  assert.notEqual(listener.lastSeenX,game.player.x);
  const resumed=Sim.restoreMatch(Sim.snapshotMatch(game));
  for(let i=0;i<90;i++){
    Sim.tick(game,1/60);Sim.tick(resumed,1/60);
    if(game.status!=='playing')break;
    assert.equal(Sim.snapshotMatch(game),Sim.snapshotMatch(resumed));
  }
});

test('BR a directly visible shooter stays exact rather than becoming a rounded sound marker',()=>{
  const game=Sim.newMatch(9922,1);game.status='playing';
  const listener=game.bots[0];
  game.player.x=1.3;game.player.z=0;game.player.yaw=Math.PI;
  listener.x=1.3;listener.z=-10;listener.angle=Math.PI;
  listener.lastSeenX=40;listener.lastSeenZ=40;listener.lastSeenUntil=2.5;
  assert.equal(Sim.tag(game).ok,true);
  assert.equal(listener.lastSeenX,1.3);
  assert.equal(listener.lastSeenZ,0);
});

test('BR fresh rival gunfire replaces older footstep memory and spends finite rounds',()=>{
  const game=Sim.newMatch(9923,2);game.status='playing';
  game.player.x=0;game.player.z=0;
  const [shooter,listener]=game.bots;
  shooter.x=0;shooter.z=-10;shooter.angle=Math.PI;
  shooter.moveTime=999;shooter.actionTime=0;shooter.loaded=12;shooter.charges=36;
  listener.x=6;listener.z=-10;listener.angle=0;
  listener.moveTime=999;listener.actionTime=999;
  listener.lastSeenX=40;listener.lastSeenZ=40;listener.lastSeenUntil=2.5;
  Sim.tick(game,1/60);
  assert.equal(shooter.charges,35);
  assert.deepEqual([listener.lastSeenX,listener.lastSeenZ],
    [Sim.approximateSoundPosition(shooter).x,Sim.approximateSoundPosition(shooter).z]);
});
