'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Footpaths=require('../src/public-city-footpaths.js');
const Sim=require('../src/simulation.js');
const start={x:-10,z:0},end={x:10,z:0};
test('a drawn non-solid canopy does not divert a real pedestrian route',()=>{
  const shade={x:0,z:0,w:8,d:8,type:'decorative-canopy',solid:false};
  const path=Footpaths.plan(start,end,[shade]);
  assert.deepEqual(path,[start,end]);
  assert.ok(Object.isFrozen(path));
});
test('the same extent with a physical collision body forces a navigable detour',()=>{
  const body={x:0,z:0,w:8,d:8,solid:true,type:'story-public-wall'};
  const path=Footpaths.plan(start,end,[body]);
  assert.ok(path&&path.length>=3,'must walk around the real obstacle');
  for(let i=1;i<path.length;i++){
    const a=path[i-1],b=path[i];
    const inflated={...body,w:body.w+2*Footpaths.CLEARANCE,d:body.d+2*Footpaths.CLEARANCE};
    assert.equal(Sim.lineBlocked(a.x,a.z,b.x,b.z,[inflated]),false);
  }
});
test('fast straight path cannot bypass the physical 175m world boundary',()=>{
  assert.equal(Footpaths.plan({x:174,z:0},{x:170,z:0},[]),null);
  assert.equal(Footpaths.plan({x:-174,z:0},{x:-170,z:0},[]),null);
  assert.deepEqual(Footpaths.plan({x:170,z:0},{x:169,z:0},[]),
    [{x:170,z:0},{x:169,z:0}]);
});
