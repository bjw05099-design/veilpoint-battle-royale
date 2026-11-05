'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Sim=require('../src/simulation.js');
const STEP=1/60;
function activeGate(){
 const game=Sim.newMatch(5195,1);
 game.status='playing';
 game.player.x=Sim.SERVICE_YARD.switchX;
 game.player.z=Sim.SERVICE_YARD.switchZ;
 assert.equal(Sim.operateServiceGate(game).ok,true);
 return game;
}
test('standing on the physical gate rail stops motor feedback without letting solid gate tunnel',()=>{
 const game=activeGate();
 assert.equal(Sim.gateMotorActive(game),true);
 game.player.x=Sim.SERVICE_YARD.x;
 game.player.z=Sim.SERVICE_YARD.z;
 assert.equal(Sim.gateMotorActive(game),false);
 assert.equal(Sim.serviceGateStatus(game).obstructed,true);
 const before=game.yardGate.progress;
 Sim.tick(game,STEP,{});
 assert.equal(game.yardGate.progress,before);
 assert.match(game.message,/TRACK OBSTRUCTED/);
 game.player.x=Sim.SERVICE_YARD.switchX;
 game.player.z=Sim.SERVICE_YARD.switchZ;
 assert.equal(Sim.gateMotorActive(game),true);
 Sim.tick(game,STEP,{});
 assert.ok(game.yardGate.progress>before,'motor resumes on cleared rail');
 assert.equal(Sim.serviceGateStatus(game).obstructed,false);
});
test('gate obstruction is computed from world geometry after checkpoint restore',()=>{
 const a=activeGate();
 const b=Sim.restoreMatch(Sim.snapshotMatch(a));
 for(const world of [a,b]){
  world.bots[0].x=Sim.SERVICE_YARD.x;
  world.bots[0].z=Sim.SERVICE_YARD.z;
  assert.equal(Sim.serviceGateStatus(world).obstructed,true);
  assert.equal(Sim.gateMotorActive(world),false);
 }
 Sim.tick(a,STEP,{});Sim.tick(b,STEP,{});
 assert.equal(a.yardGate.progress,b.yardGate.progress);
 assert.equal(a.message,b.message);
});
