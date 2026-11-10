'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Sim=require('../src/simulation.js');
const Paths=require('../src/public-city-footpaths.js');
const Guide=require('../src/story-pedestrian-guidance.js');
const p=(x,z)=>({x,z,yaw:0}),m=(x,z)=>({id:'civilian-public-desk',x,z});
test('CH01 direct HUD never claims a capsule can walk through a centerline-only opening',()=>{
 const walls=[{x:5,z:-1.5,w:2,d:1,h:3},{x:5,z:1.5,w:2,d:1,h:3}];
 const start=p(0,0),end=m(10,0);
 assert.equal(Sim.lineBlocked(0,0,10,0,walls),false,
   'the narrow central sightline is unobstructed');
 const result=Guide.plan(start,end,walls);
 assert.notEqual(result?.kind,'direct',
   'a narrow gap must not produce a false physically walkable direct instruction');
 if(result){
  const inflated=walls.map(w=>({...w,w:w.w+2*Paths.CLEARANCE,d:w.d+2*Paths.CLEARANCE}));
  for(let i=1;i<result.points.length;i++){
   const a=result.points[i-1],b=result.points[i];
   assert.equal(Sim.lineBlocked(a.x,a.z,b.x,b.z,inflated),false);
  }
 }
});
test('wide unobstructed civic street still provides a direct local route',()=>{
 const walls=[{x:5,z:8,w:2,d:1,h:3}];
 const r=Guide.plan(p(0,0),m(10,0),walls);
 assert.equal(r.kind,'direct');
 assert.equal(r.distance,10);
 assert.equal(r.terrainVerified,true);
 assert.equal(r.peopleVerified,false);
});
