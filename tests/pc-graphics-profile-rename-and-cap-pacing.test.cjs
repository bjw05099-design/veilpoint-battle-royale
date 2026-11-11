'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const Graphics=require('../src/graphics.js');
const app=fs.readFileSync(path.resolve(__dirname,'../src/app.js'),'utf8');
test('PC retains valid custom and label-free legacy profiles but fails closed on unknown labels',()=>{
 const chosen=Graphics.customize(Graphics.fromPreset('balanced'),'fpsCap',60);
 assert.deepEqual(Graphics.deserialize(Graphics.serialize(chosen)),chosen);
 const {preset,...legacy}=chosen;
 assert.deepEqual(Graphics.deserialize(JSON.stringify(legacy)),chosen,
  'all independently validated old graphics values survive upgrades');
 assert.deepEqual(Graphics.deserialize(JSON.stringify({
  ...chosen,preset:'retired-visual-profile'})),Graphics.fromPreset('hyperreal165'),
  'an unrecognized explicit label is still untrusted, even with valid numeric fields');
 assert.deepEqual(Graphics.deserialize(JSON.stringify({...chosen,resolutionScale:1.99})),
  Graphics.fromPreset('hyperreal165'));
 assert.deepEqual(Graphics.deserialize('not-json'),Graphics.fromPreset('hyperreal165'));
});
test('frame pacing must use the selected cap and cannot certify unmeasured GPU hardware',()=>{
 assert.equal(Graphics.frameBudgetStatus(10,60),'within-budget');
 assert.equal(Graphics.frameBudgetStatus(10,120),'over-budget');
 assert.equal(Graphics.frameBudgetStatus(10,165),'over-budget');
 assert.equal(Graphics.frameBudgetStatus(1000/165,165),'within-budget');
 assert.equal(Graphics.frameBudgetStatus(NaN,60),'unmeasured');
 assert.equal(Graphics.frameBudgetStatus(9,240),'unmeasured');
 assert.equal(Graphics.frameBudgetStatus(-2,60),'unmeasured');
});
test('actual BR PC performance HUD refuses a pace verdict from fewer than 30 valid callback samples',()=>{
 assert.match(app,/raf\.count>=30\s*\?graphics\.frameBudgetStatus\(raf\.p95,graphicsSettings\.fpsCap\):'unmeasured'/);
 assert.match(app,/표시 콜백 P95/);
 assert.match(app,/브라우저 측정값 · 모니터\/실제 GPU FPS 미인증/);
 // No advertised native 165fps measurement is produced by a 60Hz simulation.
 assert.doesNotMatch(app,/실제 그래픽카드 165FPS 검증 성공/);
});
