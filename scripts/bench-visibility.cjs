'use strict';
/* CPU-only microbenchmark. This does not measure GPU frame time, real FPS or 165Hz output. */
const {performance}=require('node:perf_hooks');
const Sim=require('../src/simulation.js');
const Vis=require('../src/visibility.js');
const state=Sim.newMatch(20261027,18);
state.zone.radius=100;
const iterations=3000;
const samples=[],ratios=[];
for(let i=0;i<iterations;i++){
 state.player.yaw=i/iterations*Math.PI*8;
 const start=performance.now();
 const plan=Vis.planVisible(state,16/9);
 const elapsed=performance.now()-start;
 if(i>=100)samples.push(elapsed); // warmup excluded
 const oldBoxes=state.bots.filter(b=>b.alive).length*6+state.loot.filter(l=>!l.picked).length*2+128+state.effects.length;
 if(oldBoxes)ratios.push(1-plan.stats.estimatedDynamicVertices/(oldBoxes*36));
}
samples.sort((a,b)=>a-b);
const avg=a=>a.reduce((s,v)=>s+v,0)/a.length;
console.log(JSON.stringify({type:'CPU-only visibility planner benchmark',iterations,measured:samples.length,meanMs:avg(samples),p95Ms:samples[Math.floor(samples.length*.95)],meanEstimatedVertexReduction:avg(ratios),gpuMs:null,actualFps:null,displayHz:null},null,2));
