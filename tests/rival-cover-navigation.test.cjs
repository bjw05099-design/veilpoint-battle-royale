'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Sim=require('../src/simulation.js');

function obstructedMatch(){
  const game=Sim.newMatch(91031,1);
  game.status='playing';
  game.player.x=40;game.player.z=40;
  const rival=game.bots[0];
  rival.x=0;rival.z=0;rival.angle=0;rival.actionTime=100;
  rival.lastSeenUntil=0;rival.moveTime=100;
  // A physical barrier immediately ahead of the patrol; two flank barriers
  // also prevent the old unconditional sidestep from crossing solid cover.
  game.obstacles=[
    {x:0,z:-1.5,w:5,d:.5,h:2,type:'test-wall'},
    {x:-1.5,z:0,w:.5,d:4,h:2,type:'test-wall'},
    {x:1.5,z:0,w:.5,d:4,h:2,type:'test-wall'}
  ];
  game.loot=[];
  return game;
}

test('blocked rival cannot tunnel through cover during fixed 60Hz ticks',()=>{
  const a=obstructedMatch(),b=obstructedMatch();
  for(let frame=0;frame<180;frame++){
    Sim.tick(a,1/60,{});
    Sim.tick(b,1/60,{});
    assert.deepEqual({x:a.bots[0].x,z:a.bots[0].z},
      {x:b.bots[0].x,z:b.bots[0].z});
    assert.equal(Sim.blocked(a.bots[0].x,a.bots[0].z,.85,a.obstacles),false);
  }
  assert.equal(a.player.health,b.player.health);
});
