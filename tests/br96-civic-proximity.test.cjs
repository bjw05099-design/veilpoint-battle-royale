'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {nearbyCivicSurfaces}=require('../src/br96-civic-proximity.cjs');
const ground=[{id:'market',x:10,z:0,w:8,d:6},{id:'ferry',x:80,z:0,w:10,d:10}];
test('real actor at civic edge is near even without center overlap',()=>{
 assert.deepEqual(nearbyCivicSurfaces({x:18,z:0},ground,4),['market']);
});
test('no remote surface is reported; distance uses rectangle edges',()=>{
 assert.deepEqual(nearbyCivicSurfaces({x:30,z:0},ground,4),[]);
 assert.deepEqual(nearbyCivicSurfaces({x:75,z:0},ground,0),['ferry']);
});
test('reject clientless coordinates and invalid radius',()=>{
 assert.throws(()=>nearbyCivicSurfaces({x:NaN,z:0},ground),/server_actor_required/);
 assert.throws(()=>nearbyCivicSurfaces({x:0,z:0},ground,-1),/invalid_civic_geometry/);
});
test('malformed surfaces cannot create phantom interaction areas',()=>{
 assert.deepEqual(nearbyCivicSurfaces({x:0,z:0},[{id:'bad',x:0,z:0,w:NaN,d:3}],20),[]);
});
