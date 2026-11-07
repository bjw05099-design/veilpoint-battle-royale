'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Story=require('../src/story-slice.js');
const Journal=require('../src/field-journal.js');

function inspect(state){
 return Journal.entries(state).find(row=>row.id==='debrief');
}
test('CH01 shows no ending summary before a real completed world, even with optional flags',()=>{
 const state=Story.createState();
 state.choice='evacuation';
 state.musterConfirmed=true;
 state.aidDelivered=true;
 assert.equal(inspect(state),undefined);
 state.phase='complete';
 assert.equal(inspect(state),undefined,'completed phase alone cannot imply a successful exit');
 state.world.status='won';
 assert.ok(inspect(state).unlocked);
 assert.match(inspect(state).detail,/남쪽 안뜰 대피 경로 완료/);
});
test('CH01 earned debrief differentiates actual civilian outcomes without phantom awards',()=>{
 const state=Story.createState();
 state.choice='evacuation';state.phase='complete';state.world.status='won';
 let entry=inspect(state);
 assert.match(entry.detail,/담당자 현장 협의 미실시/);
 assert.match(entry.detail,/비상 물품 인계 미완료/);
 assert.match(entry.detail,/안내원 동행 선택 미완료/);
 state.musterConfirmed=true;state.aidDelivered=true;state.guide.arrived=true;
 const before=JSON.stringify(state);
 entry=inspect(state);
 assert.match(entry.detail,/담당자 현장 협의 완료/);
 assert.match(entry.detail,/비상 물품 인계 완료/);
 assert.match(entry.detail,/안내원 안뜰 도착/);
 assert.equal(JSON.stringify(state),before,'read-only journal may not mutate 60Hz checkpoint state');
 assert.ok(Object.isFrozen(entry));
});
test('CH01 completed verification report uses actual delivered record evidence',()=>{
 const state=Story.createState();
 state.phase='complete';state.choice='verification';state.world.status='won';
 assert.match(inspect(state).detail,/동쪽 추가 확인 경로 완료/);
 assert.match(inspect(state).detail,/중계 로그 미열람/);
 state.gateLogReviewed=true;
 state.logHandedOff=true;
 assert.match(inspect(state).detail,/현장 중계 로그 열람 완료/);
 assert.match(inspect(state).detail,/현장 기록 전달 완료/);
 state.choice=null;
 assert.equal(inspect(state),undefined,'no route choice, no fabricated ending');
});
