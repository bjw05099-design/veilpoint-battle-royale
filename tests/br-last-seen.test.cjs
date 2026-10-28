'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const Sim = require('../src/simulation.js');

function encounter(seed=121){
  const game=Sim.newMatch(seed,1);
  game.status='playing';
  game.player.x=0;game.player.z=0;game.player.yaw=0;
  const rival=game.bots[0];
  rival.x=0;rival.z=-15;rival.angle=Math.PI;rival.moveTime=100;rival.actionTime=100;
  return game;
}
test('BR rival remembers only an observed player position and cannot shoot through new cover',()=>{
  const g=encounter(),b=g.bots[0];
  Sim.tick(g,1/60,{});
  assert.ok(b.lastSeenUntil>g.elapsed);
  assert.equal(b.lastSeenZ,0);
  const rounds=b.charges;
  g.obstacles.push({x:0,z:-7,w:12,d:1,h:3,type:'cover'});
  g.player.z=8;
  for(let i=0;i<90;i++)Sim.tick(g,1/60,{});
  assert.equal(b.lastSeenZ,0,'unseen player movement does not refresh AI memory');
  assert.equal(b.charges,rounds,'cover prevents firing at an unobserved location');
  assert.ok(b.lastSeenUntil>g.elapsed);
  for(let i=0;i<90;i++)Sim.tick(g,1/60,{});
  assert.ok(g.elapsed>b.lastSeenUntil);
  assert.equal(b.lastSeenZ,0,'expired memory never becomes omniscient');
});
test('BR last-seen search is fixed-step deterministic and does not regenerate ammunition',()=>{
  const a=encounter(441),b=encounter(441);
  for(const g of [a,b]){Sim.tick(g,1/60,{});g.obstacles.push({x:0,z:-7,w:12,d:1,h:3});g.player.z=8;}
  for(let i=0;i<210;i++){Sim.tick(a,1/60,{});Sim.tick(b,1/60,{});}
  assert.deepEqual(a.bots.map(x=>[x.x,x.z,x.angle,x.lastSeenX,x.lastSeenZ,x.lastSeenUntil,x.charges]),
    b.bots.map(x=>[x.x,x.z,x.angle,x.lastSeenX,x.lastSeenZ,x.lastSeenUntil,x.charges]));
  assert.equal(a.bots[0].charges,36);
  assert.equal(a.player.health,100);
});
