'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const S=require('../src/simulation.js');

function prepare(seed, byBoundary) {
  const game=S.newMatch(seed,2);
  game.status='playing';
  // Two living rivals can see each other in the clear central corridor.
  const [a,b]=game.bots;
  Object.assign(a,{x:5,z:0,angle:0,moveTime:999,actionTime:-1,skill:1,loaded:12,charges:36});
  Object.assign(b,{x:5,z:-5,angle:Math.PI,moveTime:999,actionTime:-1,skill:1,loaded:12,charges:36});
  game.player.x=byBoundary?160:-100;
  game.player.z=0;
  if(byBoundary){
    game.elapsed=89.99;
    Object.assign(game.zone,S.phaseAt(game.elapsed));
  }else{
    game.player.health=0;
    game.player.alive=false;
    game.status='lost';
  }
  return game;
}

test('BR published boundary disqualification does not permit post-result rival shots',()=>{
  const game=prepare(9201,true);
  const before=game.bots.map(b=>({health:b.health,charges:b.charges,loaded:b.loaded}));
  S.tick(game,1/60,{});
  assert.equal(game.status,'lost');
  assert.match(game.message,/DISQUALIFIED/);
  assert.deepEqual(game.bots.map(b=>({health:b.health,charges:b.charges,loaded:b.loaded})),before);
  const positions=game.bots.map(b=>[b.x,b.z]);
  S.tick(game,1/60,{});
  assert.deepEqual(game.bots.map(b=>[b.x,b.z]),positions,'terminal state does not advance next tick');
});

test('BR live rivals still fire and spend finite rounds before terminal result',()=>{
  const game=prepare(9202,false);
  game.player.alive=true;game.player.health=100;game.status='playing';
  game.player.x=-100;
  S.tick(game,1/60,{});
  assert.equal(game.status,'playing');
  assert.ok(game.bots.some(b=>b.charges<36),'legitimate pre-result opponent engagement remains active');
});

test('BR player incapacitation halts subsequent rival attacks in the same 60Hz step',()=>{
  const game=S.newMatch(9203,2);
  game.status='playing';
  game.player.x=0;game.player.z=-4;game.player.health=1;
  const [first,second]=game.bots;
  Object.assign(first,{x:0,z:0,angle:0,moveTime:999,actionTime:-1,skill:1,loaded:12,charges:36});
  Object.assign(second,{x:0,z:7,angle:0,moveTime:999,actionTime:-1,skill:1,loaded:12,charges:36});
  S.tick(game,1/60,{});
  assert.equal(game.status,'lost');
  assert.equal(game.player.health,0);
  assert.equal(first.charges,35,'the terminating hit consumes one real shot');
  assert.equal(second.charges,36,'no later actor fires after the result is decided');
  assert.equal(first.health,100,'no post-result damage is applied to other actors');
});
