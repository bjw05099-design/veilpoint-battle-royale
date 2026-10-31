'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Sim=require('../src/simulation.js');

function audibleShot(blockerAlive=true) {
  const game=Sim.newMatch(310315,2);
  game.status='playing';
  const [observer,blocker]=game.bots;
  game.player.x=1.3;game.player.z=20;game.player.yaw=Math.PI;
  observer.x=1.3;observer.z=0;observer.angle=Math.PI;
  observer.moveTime=5;observer.actionTime=5;
  blocker.x=1.3;blocker.z=10;blocker.angle=0;
  blocker.moveTime=5;blocker.actionTime=5;
  blocker.alive=blockerAlive;blocker.health=blockerAlive?100:0;
  const rounds=game.player.charges;
  assert.equal(Sim.tag(game).ok,true);
  assert.equal(game.player.charges,rounds-1,'a missed audible shot still spends ammunition');
  return {game,observer,blocker};
}

test('BR living actor screens a visible gunshot: hearing yields coarse evidence, not shooter coordinates',()=>{
  const {game,observer}=audibleShot(true);
  assert.deepEqual([observer.lastSeenX,observer.lastSeenZ],[2,20]);
  assert.notEqual(observer.lastSeenX,game.player.x);
  assert.equal(observer.lastSeenUntil,2.5);
  const saved=Sim.snapshotMatch(game);
  const restored=Sim.restoreMatch(saved);
  assert.equal(restored.bots[0].lastSeenX,2);
  assert.equal(restored.bots[0].lastSeenZ,20);
});

test('BR fallen actor no longer blocks direct observation of an audible shooter',()=>{
  const {game,observer}=audibleShot(false);
  assert.equal(observer.lastSeenX,game.player.x);
  assert.equal(observer.lastSeenZ,game.player.z);
  assert.equal(observer.lastSeenUntil,2.5);
});

test('BR actor-screened sound memory remains deterministic over 60Hz replay and save/restore',()=>{
  const {game}=audibleShot(true);
  const restored=Sim.restoreMatch(Sim.snapshotMatch(game));
  for(let i=0;i<90;i++){
    Sim.tick(game,1/60);
    Sim.tick(restored,1/60);
    assert.equal(Sim.snapshotMatch(game),Sim.snapshotMatch(restored));
  }
});
