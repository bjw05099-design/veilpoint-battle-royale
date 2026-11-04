'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Sim=require('../src/simulation.js');

test('sliding yard gate does not tunnel through a standing actor on a coarse direct advance',()=>{
 const game=Sim.newMatch(51005,0);
 game.status='playing';
 const gate=game.obstacles.find(o=>o.routeId==='br-service-gate');
 // Narrow proxy isolates the swept-volume regression; normal gameplay uses
 // the full authored panel and fixed 60Hz movement.
 gate.w=1;
 game.yardGate={engaged:true,progress:0,closing:false};
 game.player.x=33.6;game.player.z=Sim.SERVICE_YARD.z;
 const initialX=gate.x;
 Sim.advanceServiceGate(game,2);
 assert.equal(gate.x,initialX);
 assert.equal(game.yardGate.progress,0);
 assert.match(game.message,/TRACK OBSTRUCTED/);
 game.player.z=Sim.SERVICE_YARD.z+5;
 Sim.advanceServiceGate(game,2);
 assert.equal(game.yardGate.progress,1);
 assert.equal(gate.x,Sim.SERVICE_YARD.x+Sim.SERVICE_YARD.slide);
});

test('gate resumes after obstruction clears under 60Hz ticks',()=>{
 const game=Sim.newMatch(51006,0);
 game.status='playing';
 game.yardGate={engaged:true,progress:0,closing:false};
 game.player.x=Sim.SERVICE_YARD.x+3.4;
 game.player.z=Sim.SERVICE_YARD.z;
 for(let i=0;i<60;i++)Sim.advanceServiceGate(game,1/60);
 assert.equal(game.yardGate.progress,0);
 game.player.z=Sim.SERVICE_YARD.z+5;
 for(let i=0;i<120;i++)Sim.advanceServiceGate(game,1/60);
 assert.equal(game.yardGate.progress,1);
});
