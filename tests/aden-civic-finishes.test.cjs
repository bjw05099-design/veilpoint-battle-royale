'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {applyCivilFinishes}=require('../src/aden-civic-finishes.cjs');
const {SCENE_FORMAT}=require('../src/aden-civic-street-details.cjs');
function scene(){return {format:SCENE_FORMAT,coordinateSystem:'local-metre-unreferenced',
 actualAdenCoverageVerified:false,sensitiveOperationalSites:false,
 parts:[{id:'market-wall-1',finish:'warm-lime'},
 {id:'arcade-screen-2',finish:'painted-lattice'},
 {id:'walk-paver-3',finish:'street-paving'}]};}
test('civilian finish variants are deterministic and bounded',()=>{
 const a=applyCivilFinishes(scene()),b=applyCivilFinishes(scene());
 assert.deepEqual(a,b);assert.equal(a.partCount,3);
 for(const m of a.assignments){
  assert.ok(m.roughness>=.63&&m.roughness<=.88);
  assert.equal(m.metallic,0);assert.equal(m.collisionUnchanged,true);
  assert.ok(m.baseColor.every(v=>v>=0&&v<=1));
 }
});
test('rejects invented geographic accuracy and duplicate components',()=>{
 const s=scene();s.actualAdenCoverageVerified=true;
 assert.throws(()=>applyCivilFinishes(s));
 const d=scene();d.parts.push({...d.parts[0]});
 assert.throws(()=>applyCivilFinishes(d));
});
test('original geometry and scene remain unmodified',()=>{
 const s=scene(),before=JSON.stringify(s);
 applyCivilFinishes(s);assert.equal(JSON.stringify(s),before);
});
