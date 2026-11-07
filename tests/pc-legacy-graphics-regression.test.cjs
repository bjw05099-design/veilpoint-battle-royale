'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Graphics=require('../src/graphics.js');

test('complete pre-preset PC graphics profiles retain all independent selections',()=>{
 const legacy={fpsCap:90,resolutionScale:.7,vegetationDensity:.55,effects:.4};
 const restored=Graphics.deserialize(JSON.stringify(legacy));
 assert.deepEqual(restored,{...legacy,preset:'custom'});
 assert.deepEqual(Graphics.deserialize(Graphics.serialize(restored)),restored);
 assert.equal(Graphics.deserialize(JSON.stringify({...legacy,preset:'unknown'})).preset,'hyperreal165',
  'explicitly unknown labels still follow the original fail-closed fallback');
});

test('incomplete or malformed graphics profiles remain safe without partial upgrades',()=>{
 const legacy={fpsCap:90,resolutionScale:.7,vegetationDensity:.55};
 assert.deepEqual(Graphics.deserialize(JSON.stringify(legacy)),Graphics.fromPreset('hyperreal165'));
 assert.deepEqual(Graphics.deserialize('{bad'),Graphics.fromPreset('hyperreal165'));
});
