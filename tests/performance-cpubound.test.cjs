'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createResolutionGovernor}=require('../src/performance.js');

test('CPU-only overload never degrades GPU resolution',()=>{
 const g=createResolutionGovernor({minScale:.7,maxScale:1.25,initialScale:1.25,cooldownMs:0});
 for(let t=0;t<=30000;t+=1000)
  assert.equal(g.update({nowMs:t,gpuP95:3,cpuP95:15,gpuSamples:100,cpuSamples:100}),1.25);
});

test('GPU overload still steps down one notch with cooldown',()=>{
 const g=createResolutionGovernor({minScale:.7,maxScale:1.25,initialScale:1.25,cooldownMs:2500});
 const sample=t=>({nowMs:t,gpuP95:12,cpuP95:3,gpuSamples:100,cpuSamples:100});
 assert.equal(g.update(sample(1000)),1.1);
 assert.equal(g.update(sample(2000)),1.1);
 assert.equal(g.update(sample(3600)),1);
});

test('mixed load preserves quality if CPU dominates substantially',()=>{
 const g=createResolutionGovernor({minScale:.7,maxScale:1.25,initialScale:1.25,cooldownMs:0});
 for(let t=0;t<10000;t+=1000)
  assert.equal(g.update({nowMs:t,gpuP95:7,cpuP95:14,gpuSamples:60,cpuSamples:60}),1.25);
});

test('GPU-light, CPU-heavy frames do not upscale and destabilize frame time',()=>{
 const g=createResolutionGovernor({minScale:.7,maxScale:1.25,initialScale:.8,cooldownMs:0});
 for(let t=0;t<10000;t+=1000)
  assert.equal(g.update({nowMs:t,gpuP95:2,cpuP95:14,gpuSamples:60,cpuSamples:60}),.8);
});
