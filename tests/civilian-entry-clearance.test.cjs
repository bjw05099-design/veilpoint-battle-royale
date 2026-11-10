'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {makeQuarter}=require('../src/aden-civic-kit.cjs');
const {validate}=require('../scripts/check-civilian-entry-clearance.cjs');
function fixture(){return makeQuarter(()=>12);}
test('three original civilian entrances preserve physical pedestrian clearance',()=>{
 const result=validate(fixture());
 assert.equal(result.ok,true,JSON.stringify(result.failures));
 assert.equal(result.buildings,3);
});
test('a colliding obstruction inside an entrance is rejected',()=>{
 const q=fixture(), b=q.buildings[0];
 const parts=[...q.parts,{owner:b.id,role:'blocked-entry',solid:true,
   x:b.x,z:b.z-b.d/2,y:b.groundMetres+1,w:2,d:1,h:2}];
 const result=validate({...q,parts:[...q.parts.slice(0,38),parts[39]]});
 // Replace one nonessential prop to retain inventory contract.
 assert.equal(result.ok,false);
 assert.match(result.failures.join(' '),/blocked entrance/);
});
test('unverified real city provenance cannot be silently promoted',()=>{
 assert.throws(()=>validate({...fixture(),actualAdenCoverageVerified:true}),/Unverified/);
});
