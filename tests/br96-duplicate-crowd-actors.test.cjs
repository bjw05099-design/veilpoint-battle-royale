'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {assessPedestrianFlow}=require('../src/br96-pedestrian-flow.cjs');

test('a duplicate server actor reference never becomes an extra physical pedestrian',()=>{
 const self={x:0,z:0},a={x:1,z:0},b={x:2,z:0};
 const unique=assessPedestrianFlow(self,[self,a,b],()=>false,{x:1,z:0});
 const repeated=assessPedestrianFlow(self,[self,a,a,b,b,b],()=>false,{x:1,z:0});
 assert.deepEqual(repeated,unique);
 assert.equal(unique.mobility,.92);
 assert.equal(assessPedestrianFlow(self,[self,a,a,a]).mobility,1);
});
