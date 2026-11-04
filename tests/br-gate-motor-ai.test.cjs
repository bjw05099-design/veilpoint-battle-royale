'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Sim=require('../src/simulation.js');
const INPUT={forward:false,back:false,left:false,right:false,sprint:false,crouch:false};
function setup(){
  const game=Sim.newMatch(20261105,1);
  game.status='playing';
  // Isolate the motor clue: a visible player must legitimately win priority.
  // Keep the stationary player beyond the rival's 55m sight range.
  game.player.x=-40;game.player.z=50;
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

test('completed open gate becomes silent and a deliberate closing restarts local motor',()=>{
  const game=setup(),bot=game.bots[0];
  // Use a real world switch transition, rather than forging a motor flag.
  game.player.x=Sim.SERVICE_YARD.switchX;
  game.player.z=Sim.SERVICE_YARD.switchZ;
  assert.equal(Sim.operateServiceGate(game).ok,true);
  assert.equal(Sim.serviceGateStatus(game).motorActive,true);
  game.player.x=-40;game.player.z=50;
  for(let i=0;i<120;i++)Sim.tick(game,1/60,INPUT);
  assert.equal(Sim.serviceGateStatus(game).open,true);
  assert.equal(Sim.serviceGateStatus(game).motorActive,false);
  bot.lastSeenX=0;bot.lastSeenZ=0;bot.lastSeenUntil=0;
  Sim.tick(game,1/60,INPUT);
  assert.equal(bot.lastSeenUntil,0,'a parked open panel cannot reveal itself by motor sound');
  game.player.x=Sim.SERVICE_YARD.switchX;
  game.player.z=Sim.SERVICE_YARD.switchZ;
  assert.equal(Sim.operateServiceGate(game).ok,true);
  assert.equal(Sim.gateMotorActive(game),true,'closing is audible too');
  game.player.x=-40;game.player.z=50;
  Sim.tick(game,1/60,INPUT);
  assert.equal(bot.lastSeenX,30);
  assert.equal(bot.lastSeenZ,-24);
});

test('gate motor hearing respects local range and solid cover, not global opponent tracking',()=>{
  const game=setup(),bot=game.bots[0];
  game.yardGate.engaged=true;
  bot.x=95;bot.z=50;
  Sim.tick(game,1/60,INPUT);
  assert.equal(bot.lastSeenUntil,0,'distant rival receives no motor position');
  bot.x=30;bot.z=-12;bot.angle=Math.PI;bot.lastSeenUntil=0;
  // A solid temporary wall between the actual moving motor and listener
  // reduces audible reach from 22 to 9 world units.
  game.obstacles.push({x:30,z:-18,w:6,d:2,h:3,type:'temporary-test-cover'});
  Sim.tick(game,1/60,INPUT);
  assert.equal(bot.lastSeenUntil,0,'12m behind solid cover is beyond the occluded 9m range');
});

test('gate render and PC prompt expose the same 60Hz motor state without invisible opponent radar',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const renderer=fs.readFileSync(path.join(__dirname,'../src/renderer.js'),'utf8');
 const app=fs.readFileSync(path.join(__dirname,'../src/app.js'),'utf8');
 assert.match(renderer,/gateMotorActive\(state\)/,'physical WebGL and fallback must observe motor phase');
 assert.match(app,/MOTOR AUDIBLE NEARBY/,'PC interaction HUD identifies audible phase');
 assert.doesNotMatch(app,/lastSeenX|lastSeenZ/,'PC UI never reads hidden AI investigation coordinates');
});
