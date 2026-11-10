'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Sim=require('../src/simulation.js');
const Footpaths=require('../src/public-city-footpaths.js');
const Guidance=require('../src/story-pedestrian-guidance.js');
const player=(x,z)=>({x,z,yaw:0});
const target=(x,z,id='public-evac')=>({id,x,z,label:'공공 대피 경로'});
test('read-only direct walk, immutable points, no checkpoint mutations',()=>{
 const p=player(0,0),t=target(5,0),world=[];
 const before=JSON.stringify([p,t,world]);
 const r=Guidance.plan(p,t,world);
 assert.equal(r.kind,'direct');
 assert.equal(r.distance,5);
 assert.equal(r.terrainVerified,true);
 assert.equal(r.peopleVerified,false);
 assert.equal(Object.isFrozen(r.points),true);
 assert.equal(JSON.stringify([p,t,world]),before);
 assert.equal(Guidance.instruction(r),'');
});
test('collision-checked fictional wall produces actual walkable detour',()=>{
 const wall=[{x:5,z:0,w:2,d:8,h:4}];
 const r=Guidance.plan(player(0,0),target(10,0),wall);
 assert.ok(r,'pedestrian should route around a short standalone wall');
 assert.equal(r.kind,'detour');
 assert.ok(r.distance>10);
 assert.ok(r.points.length>=3);
 const inflated=wall.map(o=>({...o,w:o.w+2*Footpaths.CLEARANCE,d:o.d+2*Footpaths.CLEARANCE}));
 for(let i=1;i<r.points.length;i++){
  const a=r.points[i-1],b=r.points[i];
  assert.equal(Sim.lineBlocked(a.x,a.z,b.x,b.z,inflated),false);
 }
 assert.match(Guidance.instruction(r),/보행 우회 확인/);
});
test('fail closed for inaccessible endpoints, unverified collision and distant objectives',()=>{
 const wall=[{x:5,z:0,w:2,d:8,h:4}];
 assert.equal(Guidance.plan(player(5,0),target(10,0),wall),null);
 assert.equal(Guidance.plan(player(0,0),target(5,0),wall),null);
 assert.equal(Guidance.plan(player(0,0),target(100,0),[]),null);
 assert.equal(Guidance.plan(player(0,0),target(4,0),null),null);
 assert.throws(()=>Guidance.plan(player(0,0),target(10,0),wall,{maxVisits:99999}),RangeError);
});
test('public marker identity, escort block and explicit local selection',()=>{
 const p=player(0,0),markers=[target(10,0,'exit'),target(2,0,'guide')];
 assert.equal(Guidance.targetFor(p,markers,null,'exit').id,'exit');
 assert.equal(Guidance.targetFor(p,markers,'guide','exit',true).id,'guide');
 assert.equal(Guidance.targetFor(p,markers,null,'exit',true),null);
 assert.equal(Guidance.targetFor(p,markers,null,null).id,'guide');
 assert.equal(Guidance.targetFor(p,[{id:'invalid',x:NaN,z:0}]),null);
});
