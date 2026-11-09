'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const Sim=require('../src/simulation.js');
const {execFileSync}=require('node:child_process');
const craft=o=>o.type.startsWith('aden-craft-');
const hit=(x,z,r,o)=>{
 const dx=Math.max(Math.abs(x-o.x)-o.w/2,0),dz=Math.max(Math.abs(z-o.z)-o.d/2,0);
 return dx*dx+dz*dz<r*r;
};
test('craft hall is shared across BR and CH01 without revision-0 save regressions',()=>{
 const br=Sim.newMatch(20261027,0,'carbine');
 const hall=br.obstacles.filter(craft);
 assert.equal(hall.length,18);
 assert.equal(new Set(hall.map(o=>[o.x,o.z,o.w,o.d].join(','))).size,18);
 const old=Sim.newMatch(20261027,0,'carbine',false,'central','day',0);
 assert.equal(old.obstacles.filter(craft).length,0);
 const story=require('../src/story-slice.js');
 const world=story.createWorld?.();
 if(world)assert.deepEqual(world.obstacles.filter(craft),hall);
});
test('physical north and south entrances and central passage remain walkable',()=>{
 const obstacles=Sim.newMatch(20261027,0,'carbine').obstacles;
 for(const z of [18,21,26,35,45,51,54])
  for(const x of [-66,-63,-60])
   assert.equal(obstacles.some(o=>hit(x,z,.85,o)),false,`blocked center ${x},${z}`);
 for(const [x,z] of [[-80,35],[-46,35],[-75,31],[-51,31],[-74,51],[-52,21]])
  assert.equal(obstacles.some(o=>craft(o)&&hit(x,z,.85,o)),true,`missing solid ${x},${z}`);
});
test('craft roofs are visual-only and all three renderer paths are wired',()=>{
 const source=fs.readFileSync(require.resolve('../src/renderer.js'),'utf8');
 const native=fs.readFileSync('Unreal/Veilpoint/Source/Veilpoint/VPWorldBootstrap.cpp','utf8');
 assert.match(source,/type:'shared-public-canopy'.*canvas:'#ad9576'/s);
 assert.match(source,/o\.type\.startsWith\('aden-craft-'\)/);
 assert.match(source,/if\(o\.type==='aden-craft-hall-wall'\)/);
 assert.match(native,/SharedCraftHall\[\]/);
 assert.match(native,/CraftCanopies\[\]/);
 assert.match(native,/CraftRoofCenterCm/);
});
