'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Cache=require('../src/story-pedestrian-route-cache.js');
const Sim=require('../src/simulation.js');
const Footpaths=require('../src/public-city-footpaths.js');
const Guidance=require('../src/story-pedestrian-guidance.js');
const player={x:-8,z:0,yaw:Math.PI/2},marker={id:'civilian-public-street',x:8,z:0};
const narrow=[{x:0,z:-1.5,w:2,d:2},{x:0,z:1.5,w:2,d:2}];
test('cached CH01 route cannot become an impossible centerline shortcut through body-width gap',()=>{
 const first=Guidance.plan(player,marker,narrow);
 assert.ok(first===null||first.kind==='detour','fresh physical planner rejects narrow direct gap');
 let calls=0;
 const cache=Cache.create((p,m,obs)=>{calls++;return Guidance.plan(p,m,obs);});
 const baseline=cache.get(player,marker,narrow);
 const moved={...player,x:-7.5};
 const reused=cache.get(moved,marker,narrow);
 assert.ok(reused===null||reused.kind==='detour','moving the captain must not produce a phantom direct route');
 if(reused){
  const inflated=narrow.map(o=>({...o,w:o.w+2*Footpaths.CLEARANCE,d:o.d+2*Footpaths.CLEARANCE}));
  for(let i=1;i<reused.points.length;i++){
   const a=reused.points[i-1],b=reused.points[i];
   assert.equal(Sim.lineBlocked(a.x,a.z,b.x,b.z,inflated),false);
  }
 }
 assert.ok(calls>=1);
 assert.equal(cache.get(player,marker,[]).kind,'direct','changing geometry invalidates previous route');
});
test('clear civilian street stays direct after route reuse and never affects checkpoint data',()=>{
 const cache=Cache.create();
 const a=cache.get(player,marker,[]);
 const b=cache.get({...player,x:-7.5},marker,[]);
 assert.equal(a.kind,'direct');assert.equal(b.kind,'direct');
 assert.equal(b.points[0].x,-7.5);
 assert.equal(b.distance,15.5);
 assert.equal(b.terrainVerified,true);
 assert.equal(b.peopleVerified,false);
});
