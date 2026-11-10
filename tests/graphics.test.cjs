'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const g=require('../src/graphics.js');
test('six independent visual presets are available',()=>{
 assert.equal(Object.keys(g.PRESETS).length,6);
 for(const id of Object.keys(g.PRESETS))assert.equal(g.fromPreset(id).preset,id);
});
test('HyperReal combines highest regular browser detail with 165 FPS cap',()=>{
 assert.deepEqual(g.fromPreset('hyperreal165'),{fpsCap:165,resolutionScale:1.25,vegetationDensity:1,effects:1,preset:'hyperreal165'});
});
test('cinematic profile favors render sampling and permits independent frame-cap change',()=>{
 const x=g.fromPreset('cinematic');assert.equal(x.resolutionScale,1.25);
 const y=g.customize(x,'fpsCap',165);assert.equal(y.resolutionScale,1.25);
 assert.equal(y.preset,'custom');
});
test('independent options preserve the other settings',()=>{
 const x=g.customize(g.fromPreset('hyperreal165'),'vegetationDensity',.55);
 assert.equal(x.fpsCap,165);assert.equal(x.resolutionScale,1.25);assert.equal(x.effects,1);
});
test('saved preferences roundtrip and corrupt data resets to safe defaults',()=>{
 const x=g.customize(g.fromPreset('balanced'),'resolutionScale',.7);
 assert.deepEqual(g.deserialize(g.serialize(x)),x);
 assert.deepEqual(g.deserialize('bad'),g.fromPreset('hyperreal165'));
 assert.throws(()=>g.fromPreset('__proto__'),RangeError);
 assert.throws(()=>g.customize(x,'fpsCap',240),RangeError);
 assert.throws(()=>g.customize(x,'resolutionScale',2),RangeError);
 assert.throws(()=>g.customize(x,'bogus',2),RangeError);
});
test('frame budget helper does not claim actual measured FPS',()=>{
 assert.ok(Math.abs(g.FRAME_BUDGET_MS-1000/165)<1e-12);
 assert.equal(g.frameBudgetStatus(NaN),'unmeasured');
 assert.equal(g.frameBudgetStatus(6.05),'within-budget');
 assert.equal(g.frameBudgetStatus(8),'over-budget');
});
test('graphics restores custom-adjusted values without falsely labeling them as a stock preset',()=>{
 const altered={...g.fromPreset('balanced'),fpsCap:165};
 const serialized=g.serialize(altered);
 assert.equal(JSON.parse(serialized).preset,'custom');
 assert.deepEqual(g.deserialize(serialized),{...altered,preset:'custom'});
 const legacy=JSON.stringify(altered);
 assert.deepEqual(g.deserialize(legacy),{...altered,preset:'custom'},
  'older mismatched saved presets must retain the chosen quality and fps');
 assert.deepEqual(g.deserialize(g.serialize(g.fromPreset('balanced'))),g.fromPreset('balanced'));
 assert.deepEqual(g.deserialize(JSON.stringify({...altered,preset:'unknown'})),
  {...altered,preset:'custom'},'an outdated preset ID does not discard valid saved PC quality');
});
