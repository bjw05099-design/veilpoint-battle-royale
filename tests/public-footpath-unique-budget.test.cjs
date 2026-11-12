'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Paths=require('../src/public-city-footpaths.js');
const Sim=require('../src/simulation.js');

test('pedestrian search preserves an actual collision-clear detour and bounded search',()=>{
 const obstacle={x:0,z:0,w:4,d:10};
 const from={x:-12,z:0},to={x:12,z:0};
 assert.equal(Paths.plan(from,to,[obstacle],{maxVisits:1}),null);
 const path=Paths.plan(from,to,[obstacle],{maxVisits:11000});
 assert.ok(path&&path.length>=3,'a walkable detour must exist');
 assert.deepEqual(path[0],from);
 assert.deepEqual(path[path.length-1],to);
 const inflated={...obstacle,w:obstacle.w+2*Paths.CLEARANCE,d:obstacle.d+2*Paths.CLEARANCE};
 for(let i=1;i<path.length;i++){
  assert.equal(Sim.lineBlocked(path[i-1].x,path[i-1].z,path[i].x,path[i].z,[inflated]),false);
 }
});
test('invalid search budgets are rejected instead of permitting unbounded work',()=>{
 assert.throws(()=>Paths.plan({x:0,z:0},{x:2,z:2},[],{maxVisits:11001}),RangeError);
 assert.throws(()=>Paths.plan({x:0,z:0},{x:2,z:2},[],{maxVisits:0}),RangeError);
});
