'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const nav=require('../src/navigation.js');

test('CH01 PC next/previous objective cycle skips missing and unusable marker IDs',()=>{
 const markers=[
  {id:'start',label:'Start',x:0,z:0},
  null,
  {id:'',label:'Temporary',x:0,z:1},
  {id:'guide',label:'Guide',x:0,z:2},
  undefined,
  {id:22,label:'Unusable',x:0,z:3},
  {id:'exit',label:'Exit',x:0,z:4}
 ];
 const snapshot=markers.map(m=>m&&{...m});
 assert.equal(nav.nextMarkerId(markers),'start');
 assert.equal(nav.nextMarkerId(markers,'start'),'guide');
 assert.equal(nav.nextMarkerId(markers,'guide'),'exit');
 assert.equal(nav.nextMarkerId(markers,'exit'),null,'end returns to automatic guidance');
 assert.equal(nav.previousMarkerId(markers),'exit');
 assert.equal(nav.previousMarkerId(markers,'exit'),'guide');
 assert.equal(nav.previousMarkerId(markers,'guide'),'start');
 assert.equal(nav.previousMarkerId(markers,'start'),null);
 assert.equal(nav.nextMarkerId(markers,'stale-checkpoint'),'start');
 assert.equal(nav.previousMarkerId(markers,'stale-checkpoint'),'exit');
 assert.deepEqual(markers,snapshot,'HUD navigation does not mutate 60Hz world markers');
});

test('CH01 guide remains safely automatic when only invalid mission markers exist',()=>{
 const invalid=[null,undefined,{id:''},{id:42},{}];
 assert.equal(nav.nextMarkerId(invalid),null);
 assert.equal(nav.previousMarkerId(invalid),null);
 assert.equal(nav.nextMarkerId([]),null);
 assert.equal(nav.previousMarkerId([]),null);
 assert.equal(nav.nextMarkerId(null),null);
 assert.equal(nav.previousMarkerId(null),null);
});
