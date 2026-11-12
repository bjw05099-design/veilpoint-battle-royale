'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Eye=require('../src/aden-street-perspective.js');
const point=(right,depth)=>({right,up:0,depth});
test('street polygons beyond visibility range cannot draw fabricated distant ground',()=>{
 const p=[point(-2,Eye.FAR+2),point(2,Eye.FAR+2),point(0,Eye.FAR+5)];
 assert.deepEqual(Eye.clipFar(p),[]);
});
test('street polygon crossing far plane is clipped to finite depth without losing near geometry',()=>{
 const p=[point(-2,Eye.FAR-2),point(2,Eye.FAR+2),point(0,Eye.FAR-4)];
 const clipped=Eye.clipFar(p);
 assert.equal(clipped.length,4);
 assert.ok(clipped.every(v=>v.depth<=Eye.FAR&&Number.isFinite(v.right)&&Number.isFinite(v.up)));
 assert.ok(clipped.some(v=>v.depth===Eye.FAR));
 assert.deepEqual(Eye.clipFar([point(0,10),point(1,10),point(0,12)]),[point(0,10),point(1,10),point(0,12)]);
});
