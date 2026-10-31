'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const V = require('../src/visibility.js');
const scene = () => ({
  player:{x:0,z:0,yaw:0},
  obstacles:[{x:0,z:-5,w:4,d:1.5,h:5}],
  bots:[{x:0,z:-10,alive:true}],
  loot:[{x:0,z:-10,picked:false}],
  effects:[{x:0,z:-10,t:.2,type:'hostile'}],
  zone:{x:0,z:0,radius:100}
});
test('solid cover hides opponents, caches and hostile flashes without modifying simulation',()=>{
 const s=scene(),before=JSON.stringify(s);
 const plan=V.planVisible(s);
 assert.equal(plan.stats.botsTotal,1);
 assert.equal(plan.stats.lootTotal,1);
 assert.equal(plan.stats.botsVisible,0);
 assert.equal(plan.stats.lootVisible,0);
 assert.equal(plan.stats.effectsVisible,0);
 assert.equal(plan.stats.estimatedDynamicVertices,0);
 assert.equal(JSON.stringify(s),before);
});
test('silhouette edge exposure stays visible and turning away culls it',()=>{
 const s=scene();
 s.obstacles=[{x:0,z:-5,w:2,d:1.5,h:5}];
 s.bots[0].x=2.4;
 s.loot=[];s.effects=[];
 assert.equal(V.planVisible(s).stats.botsVisible,1);
 s.player.yaw=Math.PI;
 assert.equal(V.planVisible(s).stats.botsVisible,0);
});
test('moving around cover restores visibility without changing hit or AI state',()=>{
 const s=scene();
 assert.equal(V.planVisible(s).stats.botsVisible,0);
 s.player.x=6;
 s.player.yaw=Math.atan2(s.bots[0].x-s.player.x,-(s.bots[0].z-s.player.z));
 assert.equal(V.planVisible(s).stats.botsVisible,1);
 assert.equal(V.planVisible(s).stats.effectsVisible,1);
});
test('legacy states without obstacle metadata retain existing frustum/LOD behavior',()=>{
 const s=scene();delete s.obstacles;
 assert.equal(V.planVisible(s).stats.botsVisible,1);
 assert.equal(V.planVisible(s).stats.lootVisible,1);
 assert.equal(V.planVisible(s).stats.effectsVisible,1);
});
