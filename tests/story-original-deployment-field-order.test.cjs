'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const Story=require('../src/story-slice.js'),Sim=require('../src/simulation.js');

test('CH01 begins with orders already received in Korea, rather than an implausible Aden document pickup',()=>{
 const s=Story.createState(),p=s.world.player;
 assert.equal(s.phase,'terminal');
 assert.match(s.subtitle,/한국에서 출국하기 전에 받은 파견 지시/);
 assert.match(s.subtitle,/도착한 뒤 내전이 예상보다 빠르게 번졌고/);
 assert.match(s.subtitle,/귀환 경로도 불확실/);
 assert.deepEqual(Story.markers(s).map(m=>m.id),['terminal']);
 assert.equal(Object.hasOwn(Story.POINTS,'dispatchOrders'),false);
 assert.equal(s.world.obstacles.some(o=>o.type==='story-dispatch-case'),false);
 assert.equal(s.deploymentReviewed,false,'retired legacy flag is not a new interactive quest');
 p.x=-12;p.z=11.4;
 assert.equal(Story.nearest(s),null,
  'walking to the former paper-copy location must not reveal a new chore');
 assert.deepEqual(Story.interact(s),{ok:false,reason:'too_far'});
 p.x=Story.POINTS.terminal.x;p.z=Story.POINTS.terminal.z;
 assert.deepEqual(Story.interact(s),{ok:true,event:'terminal',phase:'engagement'});
 assert.match(s.subtitle,/현지 내전이 예상 밖으로 확대/);
 assert.match(s.subtitle,/출국 전 계획대로 복귀하기도 어려운 상황/);
 assert.equal(s.deploymentReviewed,false,'the captain does not need to rediscover what he already knows');
});

test('historical save bit from retired field pickup remains valid but cannot invent new on-site orders',()=>{
 const s=Story.createState();
 const now=Story.serialize(s);
 const old=JSON.parse(now);old.deploymentReviewed=true;
 const recovered=Story.restore(JSON.stringify(old));
 assert.equal(recovered.deploymentReviewed,true,
  'a real legacy checkpoint keeps its original acknowledged key without data loss');
 assert.equal(Story.serialize(recovered),JSON.stringify(old));
 assert.equal(Story.markers(recovered).some(m=>m.id==='dispatchOrders'),false);
 for(const forged of ['yes',1,null]){
  assert.throws(()=>Story.restore(JSON.stringify({...old,deploymentReviewed:forged})),
    /checkpoint/i,'existing strict untrusted-save validation is unchanged');
 }
 const clean=Story.restore(now);
 assert.equal(clean.deploymentReviewed,false);
 assert.equal(Story.serialize(clean),now);
 // The old flag is preserved in the save schema but no longer affects the ending.
 function completed(state){
  const p=state.world.player;
  p.x=Story.POINTS.terminal.x;p.z=Story.POINTS.terminal.z;
  assert.equal(Story.interact(state).phase,'engagement');
  for(const b of state.world.bots){b.health=0;b.alive=false;}
  state.combat.cleared=true;state.phase='records';
  p.x=Story.POINTS.decision.x;p.z=Story.POINTS.decision.z;
  assert.equal(Story.interact(state).phase,'decision');
  assert.equal(Story.choose(state,'evacuation').ok,true);
  p.x=Story.POINTS.exitEvac.x;p.z=Story.POINTS.exitEvac.z;
  assert.equal(Story.interact(state).phase,'complete');
  return Story.debrief(state);
 }
 const a=completed(clean),b=completed(recovered);
 assert.equal(a.deploymentReviewed,false);
 assert.equal(b.deploymentReviewed,true);
 assert.equal(a.summary,b.summary,'outcome cannot falsely report a paper pickup in Aden');
 assert.doesNotMatch(a.summary,/최초 파견 지시서를 직접 확인/);
});

test('Aden field documents and their mesh were removed from physics and both graphical paths',()=>{
 const renderer=fs.readFileSync(path.resolve(__dirname,'../src/renderer.js'),'utf8');
 assert.doesNotMatch(renderer,/story-dispatch-case/);
 assert.equal(Story.createState().world.obstacles.filter(o=>o.type==='story-dispatch-case').length,0);
 assert.equal(Sim.newMatch(23,0).obstacles.filter(o=>o.type==='story-dispatch-case').length,0);
 const canon=fs.readFileSync(path.resolve(__dirname,'../docs/COMBAT_CAMPAIGN_CANON.md'),'utf8');
 assert.match(canon,/in Korea before departure/);
 assert.match(canon,/do not invent a dispatch order lying in an Aden street/);
 assert.match(canon,/Chronology, character motivation and credible human decisions/);
});
