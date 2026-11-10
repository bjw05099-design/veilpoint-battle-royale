'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Relief=require('../src/aden-map-relief.js');
const P=(x,y,z)=>[x,y,z];
const endpoints=segment=>[segment.from,segment.to].map(p=>[p[0],p[2]])
 .sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
test('a 25-m contour follows the complete physically level triangle edge',()=>{
 const a=P(0,25,0),b=P(20,25,0),above=P(0,60,10),below=P(0,-10,-10);
 for(const third of [above,below]){
  const lines=Relief.contours(a,b,third,25);
  const contour=lines.filter(s=>s.level===25);
  assert.equal(contour.length,1,'the level edge must be visible on either side');
  assert.deepEqual(endpoints(contour[0]),[[0,0],[20,0]]);
  assert.ok(Object.isFrozen(contour[0])&&Object.isFrozen(contour[0].from));
 }
});
test('exact vertex crossing is deduplicated rather than omitted or doubled',()=>{
 const lines=Relief.contours(P(0,0,0),P(20,25,0),P(0,50,20),25);
 const crossing=lines.filter(s=>s.level===25);
 assert.equal(crossing.length,1);
 assert.deepEqual(endpoints(crossing[0]),[[0,10],[20,0]]);
 assert.ok(Math.hypot(
  crossing[0].from[0]-crossing[0].to[0],
  crossing[0].from[2]-crossing[0].to[2])>1);
});
test('fully level and zero-length triangle edges do not invent contours',()=>{
 assert.deepEqual(Relief.contours(P(0,25,0),P(20,25,0),P(0,25,20),25),[]);
 assert.deepEqual(Relief.contours(P(0,25,0),P(0,25,0),P(0,60,10),25)
  .filter(s=>s.level===25),[]);
 assert.throws(()=>Relief.contours(P(0,0,0),P(0,25,0),P(0,50,0),0),/contour/);
});
