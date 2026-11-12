'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Cache=require('../src/story-pedestrian-route-cache.js');
const player={x:0,z:0,yaw:0},marker={id:'public-square',x:10,z:0};
test('corrupt waypoint coordinates are never returned or cached',()=>{
 let calls=0;
 const cache=Cache.create(()=>{calls++;return {kind:'detour',points:[{x:0,z:0},{x:NaN,z:1},{x:10,z:0}]};});
 assert.equal(cache.get(player,marker,[]),null);
 assert.equal(cache.get({...player,x:1},marker,[]),null);
 assert.equal(calls,2);
});
test('oversized waypoint arrays cannot enter the reusable HUD cache',()=>{
 const cache=Cache.create(()=>({kind:'detour',points:Array.from({length:513},(_,i)=>({x:i/50,z:0}))}));
 assert.equal(cache.get(player,marker,[]),null);
 assert.equal(cache.get({...player,x:1},marker,[]),null);
 assert.equal(cache.stats().searches,2);
});
test('valid direct public route remains reusable',()=>{
 let calls=0;
 const cache=Cache.create(()=>{calls++;return {kind:'direct',points:[{x:0,z:0},{x:10,z:0}]};});
 assert.ok(cache.get(player,marker,[]));
 const result=cache.get({...player,x:1},marker,[]);
 assert.equal(result.kind,'direct');
 assert.equal(calls,1);
 assert.equal(result.distance,9);
});
