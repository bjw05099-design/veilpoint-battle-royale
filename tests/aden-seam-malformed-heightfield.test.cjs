'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Tiles=require('../src/aden-citywide-tiles.js');
const source={provider:'VEILPOINT original fictional terrain',observedDate:'2026-11-13',
 license:'original game artwork',reference:'fictional-local-heightfield',scope:'public-terrain',type:'artist-blockout'};
const make=(tx,tz)=>Tiles.createHeightTile({tx,tz,gridSize:17,
 samples:Array(17*17).fill(12),source});
test('terrain seam accepts complete matching local heightfields',()=>{
 const a=make(0,0),b=make(1,0);
 const audit=Tiles.auditSeam(a,b);
 assert.equal(audit.pass,true);
 assert.equal(audit.maxGapMetres,0);
});
test('seam rejects missing, nonfinite and out-of-range source heights',()=>{
 const a=make(0,0),b=make(1,0);
 for(const samples of [b.samples.slice(0,-1),
  b.samples.map((h,i)=>i===0?NaN:h),
  b.samples.map((h,i)=>i===0?Infinity:h),
  b.samples.map((h,i)=>i===0?4000:h)]){
  assert.throws(()=>Tiles.auditSeam(a,{...b,samples}),/Invalid terrain source/);
 }
});
test('seam rejects forged tile identity rather than accepting a matching edge',()=>{
 const a=make(0,0),b=make(1,0);
 assert.throws(()=>Tiles.auditSeam(a,{...b,key:a.key}),/Invalid terrain source/);
});
test('sparse height sources fail at import and seam audit, including holes away from the shared edge',()=>{
 const a=make(0,0),b=make(1,0);
 for(const index of [0,130,288]){
  const samples=b.samples.slice();delete samples[index];
  assert.throws(()=>Tiles.createHeightTile({...b,samples}),/Invalid 1:1 metre height grid/);
  assert.throws(()=>Tiles.auditSeam(a,{...b,samples}),/Invalid terrain source/);
 }
 assert.throws(()=>Tiles.createHeightTile({...b,samples:new Array(289)}),/Invalid 1:1 metre height grid/);
});
