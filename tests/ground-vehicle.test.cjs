'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const V=require('../src/ground-vehicle.js');
test('vehicle requires physical proximity and unoccupied seat',()=>{
 const v=V.create(0,0);assert.equal(V.enter(v,{x:9,z:0},()=>false),false);
 assert.equal(V.enter(v,{x:1,z:0},()=>false),true);
 assert.equal(V.enter(v,{x:1,z:0},()=>false),false);
});
test('engine, acceleration, braking and deterministic fixed-step motion',()=>{
 const a=V.create(0,0),b=V.create(0,0);
 for(const v of [a,b])V.enter(v,{x:1,z:0},()=>false);
 for(let i=0;i<120;i++)for(const v of [a,b])
  V.tick(v,{toggleEngine:i===0,throttle:1,steer:.2},1/60,()=>false);
 assert.deepEqual(a,b);assert.ok(a.speed>0);assert.ok(Math.hypot(a.x,a.z)>0);
 for(let i=0;i<180;i++)V.tick(a,{brake:1},1/60,()=>false);
 assert.equal(a.speed,0);
});
test('collision halts vehicle and does not penetrate obstacle',()=>{
 const v=V.create(0,0);V.enter(v,{x:0,z:0},()=>false);
 V.tick(v,{toggleEngine:true,throttle:1},1/60,()=>true);
 assert.equal(v.z,0);assert.equal(v.speed,0);
});
test('cannot exit moving vehicle; exit requires clear nearby ground',()=>{
 const v=V.create(0,0);V.enter(v,{x:0,z:0},()=>false);
 V.tick(v,{toggleEngine:true,throttle:1},1/60,()=>false);
 for(let i=0;i<50;i++)V.tick(v,{throttle:1},1/60,()=>false);
 assert.equal(V.exit(v,()=>false),null);
 for(let i=0;i<120;i++)V.tick(v,{brake:1},1/60,()=>false);
 assert.equal(V.exit(v,()=>true),null);
 assert.ok(V.exit(v,()=>false));assert.equal(v.occupied,false);
});
test('snapshot restore rejects invalid state and preserves movement',()=>{
 const v=V.create(1,2,.4);V.enter(v,{x:1,z:2},()=>false);
 const restored=V.restore(V.snapshot(v));assert.deepEqual(restored,v);
 assert.throws(()=>V.restore({...v,speed:Infinity}),RangeError);
 assert.throws(()=>V.restore({...v,teleport:true}),RangeError);
 assert.throws(()=>V.tick(v,{},.2,()=>false),RangeError);
});
test('parking brake overrides throttle and stops a moving vehicle',()=>{
 const v=V.create(0,0);V.enter(v,{x:0,z:0},()=>false);
 for(let i=0;i<120;i++)V.tick(v,{toggleEngine:i===0,throttle:1},1/60,()=>false);
 const before=v.speed;
 for(let i=0;i<120;i++)V.tick(v,{parkingBrake:true,throttle:1},1/60,()=>false);
 assert.ok(before>1);assert.equal(v.speed,0);assert.equal(v.engineOn,true);
 for(let i=0;i<30;i++)V.tick(v,{parkingBrake:true,throttle:1},1/60,()=>false);
 assert.equal(v.speed,0);
});
test('swept road collision checks intermediate positions before the endpoint',()=>{
 const v=V.create(0,0);V.enter(v,{x:0,z:0},()=>false);
 // Fix the initial state to an explicit, physically valid fast-moving vehicle.
 // The regression verifies path sampling rather than the acceleration warm-up.
 v.engineOn=true;v.speed=V.MAX_SPEED;
 const before={x:v.x,z:v.z};
 const endZ=v.z-v.speed*.05;
 const barrierZ=(v.z+endZ)/2;
 let probes=0;
 const clear=V.restore(V.snapshot(v));
 V.tick(clear,{throttle:1},.05,()=>{probes++;return false;});
 assert.ok(probes>=3,'high-speed fixed-step sweep must sample intermediate positions');
 V.tick(v,{throttle:1},.05,box=>box.z<=barrierZ);
 assert.ok(v.z>barrierZ);
 assert.equal(v.speed,0);
 assert.ok(v.z<=before.z);
});
