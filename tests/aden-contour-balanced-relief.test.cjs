'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Relief=require('../src/aden-map-relief.js');

test('fictional high-relief terrain displays bounded contour lines across the entire actual slope',()=>{
  const a=[0,0,0],b=[320,3000,0],c=[0,3000,320];
  const contours=Relief.contours(a,b,c,25);
  assert.ok(contours.length>1&&contours.length<=12);
  const levels=contours.map(line=>line.level);
  assert.ok(levels[0]>=25,'first contour is a real level above sea level');
  assert.ok(levels.at(-1)>2400,'highest part of a cliff cannot disappear behind a lowest-twelve cap');
  assert.ok(levels.every(level=>level%25===0));
  assert.ok(new Set(levels).size===levels.length);
  for(const segment of contours){
    assert.equal(segment.from[1],segment.level);
    assert.equal(segment.to[1],segment.level);
    assert.ok([...segment.from,...segment.to].every(Number.isFinite));
    assert.ok(segment.from[0]>=0&&segment.from[2]>=0);
    assert.ok(segment.to[0]>=0&&segment.to[2]>=0);
  }
});

test('ordinary low-relief contours keep their original exact levels and zero-height coastline behavior',()=>{
  const a=[0,0,0],b=[100,100,0],c=[0,100,100];
  assert.deepEqual(Relief.contours(a,b,c,25).map(s=>s.level),[25,50,75,100]);
  assert.ok(Relief.contours([0,0,0],[50,0,0],[0,50,50],25)
    .every(s=>s.level!==0),'sea-level edge remains the shoreline renderer responsibility');
});

test('extreme invalid contour ranges fail closed instead of making an unbounded render loop',()=>{
  assert.throws(()=>Relief.contours([0,-1e100,0],[10,1e100,0],[0,1e100,10],5),/contour elevation range/);
});
