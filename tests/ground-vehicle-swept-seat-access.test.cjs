'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Vehicle=require('../src/ground-vehicle.js');
test('nearby but wall-hidden vehicle seat cannot be entered through an original public collider',()=>{
 const v=Vehicle.create(0,0),barrier=(x,z)=>x>.8&&x<1.6&&Math.abs(z)<.5;
 assert.equal(Vehicle.enter(v,{x:2.4,z:0},barrier),false);
 assert.equal(v.occupied,false);
 assert.equal(Vehicle.enter(v,{x:NaN,z:0},()=>false),false);
 assert.equal(Vehicle.enter(v,null,()=>false),false);
 assert.equal(Vehicle.enter(v,{x:0,z:2.6},barrier),true);
 assert.equal(v.occupied,true);
});
test('stationary vehicle exit checks the entire nearby walkway, choosing the next accessible side',()=>{
 const v=Vehicle.create(0,0);
 assert.equal(Vehicle.enter(v,{x:0,z:0},()=>false),true);
 // -2.2m and -3m endpoints are clear, but intermediate paving is blocked.
 const barrier=(x,z)=>(x<-.9&&x>-1.3&&Math.abs(z)<.3)||
   (z< -1.3&&z> -1.7&&Math.abs(x)<.3);
 const exit=Vehicle.exit(v,barrier);
 assert.deepEqual(exit,{x:2.2,z:0});
 assert.equal(v.occupied,false);
 assert.equal(v.engineOn,false);
});
test('a sealed public parking bay does not allow a player to cross walls at exit',()=>{
 const v=Vehicle.create(0,0);
 assert.equal(Vehicle.enter(v,{x:0,z:0},()=>false),true);
 const ring=(x,z)=>Math.hypot(x,z)>1&&Math.hypot(x,z)<1.4;
 assert.equal(Vehicle.exit(v,ring),null);
 assert.equal(v.occupied,true);
 assert.deepEqual(Vehicle.exit(v,()=>false),{x:-2.2,z:0});
});
