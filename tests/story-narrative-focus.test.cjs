'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Story=require('../src/story-slice.js');

test('Korea is explicitly a predeparture flashback, not a teleport to a new playable area',()=>{
  const state=Story.createState();
  assert.match(Story.openingBeat(state).location,/회상 · 출국 전 대한민국/);
  assert.match(Story.openingBeat(state).subtitle,/정식 파견 지시와 복귀 계획을 한국에서 확인/);
  state.world.elapsed=4;
  assert.match(Story.openingBeat(state).location,/현재 · 가상 해안 도시/);
  state.world.elapsed=8;
  assert.match(Story.openingBeat(state).subtitle,/도착한 뒤/);
  assert.match(Story.objective(state),/가까이 접근하면 현장 상황이 바뀝니다/);
  assert.deepEqual(Story.markers(state).map(p=>p.id),['terminal']);
  state.world.elapsed=11;
  assert.equal(Story.openingBeat(state),null);
});
test('the route is primary gameplay; optional reports do not become a visible checklist',()=>{
  const state=Story.createState();
  state.phase='exit';state.choice='evacuation';
  const tasks=Story.missionTasks(state);
  assert.equal(tasks.filter(x=>!x.optional).length,1);
  assert.equal(tasks.find(x=>!x.optional).id,'exit');
  assert.ok(tasks.some(x=>x.optional),'old side activities remain optional');
  const app=fs.readFileSync(path.resolve(__dirname,'../src/story-app.js'),'utf8');
  assert.match(app,/const primary=tasks\.find\(task=>!task\.optional\)/);
  assert.match(app,/tracker\.classList\.toggle\('hidden',!primary\)/);
  assert.doesNotMatch(app,/tracker\.textContent=tasks\.map\(/);
  assert.doesNotMatch(app,/report\.optionalTasks\.done\+'\/'\+report\.optionalTasks\.total/);
});
test('saved CH01 v2 opening generation is unchanged by flashback text and HUD presentation',()=>{
  const state=Story.createState();
  const serialized=Story.serialize(state);
  const restored=Story.restore(serialized);
  assert.equal(restored.version,state.version);
  assert.equal(Story.serialize(restored),serialized);
  assert.equal(restored.deploymentReviewed,false);
});
