'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Sim=require('../src/simulation.js');
const INPUT={forward:false,back:false,left:false,right:false,sprint:false,crouch:false};
function setup(){
  const game=Sim.newMatch(20261105,1);
  game.status='playing';
  const bot=game.bots[0];
  bot.x=30;bot.z=-12;bot.angle=Math.PI;bot.moveTime=10;
  bot.lastSeenX=0;bot.lastSeenZ=0;bot.lastSeenUntil=0;
  return game;
}
test('a local active gate motor produces a finite investigation clue',()=>{
  const game=setup();
  game.yardGate.engaged=true;
  Sim.tick(game,1/60,INPUT);
  assert.equal(game.bots[0].lastSeenX,30);
  assert.equal(game.bots[0].lastSeenZ,-24);
  assert.ok(game.bots[0].lastSeenUntil>game.elapsed);
});
test('silent gate does not disclose its position to an opponent',()=>{
  const game=setup();
  Sim.tick(game,1/60,INPUT);
  assert.equal(game.bots[0].lastSeenUntil,0);
});
test('motor clue survives checkpoint and resumes deterministically at 60Hz',()=>{
  const game=setup();
  game.yardGate.engaged=true;
  Sim.tick(game,1/60,INPUT);
  const resumed=Sim.restoreMatch(Sim.snapshotMatch(game));
  for(let i=0;i<60;i++){
    Sim.tick(game,1/60,INPUT);
    Sim.tick(resumed,1/60,INPUT);
  }
  assert.equal(Sim.snapshotMatch(resumed),Sim.snapshotMatch(game));
});
