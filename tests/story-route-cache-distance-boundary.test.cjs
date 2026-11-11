'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {create}=require('../src/story-pedestrian-route-cache.js');
const {plan}=require('../src/story-pedestrian-guidance.js');

test('cached walking directions cannot bypass the planner 75m search horizon',()=>{
 const cache=create(plan),obstacles=[],marker={id:'public-court',x:74,z:0};
 const initial=cache.get({x:0,z:0,yaw:0},marker,obstacles);
 assert.ok(initial&&initial.terrainVerified);
 const beyond=cache.get({x:-2,z:0,yaw:0},marker,obstacles);
 assert.equal(beyond,null,'76m route must be rejected even when the cache origin moved only 2m');
 assert.equal(cache.stats().searches,2,'fall back to authoritative bounded planner');
 assert.ok(cache.get({x:1,z:0,yaw:0},marker,obstacles)?.terrainVerified);
});
