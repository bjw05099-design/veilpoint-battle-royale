'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const Story=require('../src/story-slice.js');

function route(choice){
 const state=Story.createState();
 state.phase='complete';state.choice=choice;
 return state;
}
test('CH01 south debrief audits four optional field tasks without converting them into required exit goals',()=>{
 const state=route('evacuation');
 const before=JSON.stringify(state);
 const initial=Story.optionalTaskAudit(state);
 assert.equal(initial.total,4);
 assert.equal(initial.done,0);
 assert.deepEqual(initial.finished,[]);
 assert.deepEqual(initial.unfinished,['집결지 인원 확인','현장 안내원 동행·인계','비상 물품 현장 인계','대피 통행 계획표 확인']);
 assert.equal(Story.missionTasks(state).find(x=>x.id==='exit').optional,false);
 state.musterConfirmed=true;state.guide.arrived=true;state.aidDelivered=true;
 state.transitReviewed=true;
 const earned=Story.optionalTaskAudit(state);
 assert.equal(earned.total,4);assert.equal(earned.done,4);
 assert.equal(earned.unfinished.length,0);
 assert.deepEqual(Story.debrief(state).optionalTasks,earned);
 assert.equal(Story.debrief(state).campaignUnlocked,false);
 assert.ok(Object.isFrozen(earned)&&Object.isFrozen(earned.finished)&&Object.isFrozen(earned.unfinished));
 assert.notEqual(JSON.stringify(state),before,'fixture action changes, not audit reads');
 const same=JSON.stringify(state);Story.optionalTaskAudit(state);
 assert.equal(JSON.stringify(state),same,'audit never advances the authored 60Hz world');
});
test('CH01 east debrief counts only physically reviewed logs and delivered evidence, never route gate',()=>{
 const state=route('verification');
 const initial=Story.optionalTaskAudit(state);
 assert.equal(initial.total,2);assert.equal(initial.done,0);
 assert.equal(Story.missionTasks(state).find(x=>x.id==='gate').optional,false);
 state.gateLogReviewed=true;
 let audit=Story.optionalTaskAudit(state);
 assert.equal(audit.done,1);
 assert.deepEqual(audit.finished,['현장 중계 기록 검토']);
 assert.deepEqual(audit.unfinished,['현장 기록 전달']);
 state.logHandedOff=true;
 audit=Story.optionalTaskAudit(state);
 assert.equal(audit.done,2);
 assert.equal(Story.debrief(state).optionalTasks.done,2);
 assert.equal(Story.debrief(state).previewOnly,true);
});
test('CH01 optional audit is absent before route commitment and not a future 12-hour mission unlock',()=>{
 const state=Story.createState();
 assert.deepEqual(Story.optionalTaskAudit(state).unfinished,[]);
 assert.equal(Story.optionalTaskAudit(state).total,0);
 assert.equal(Story.debrief(state),null);
 const app=fs.readFileSync(path.join(__dirname,'../src/story-app.js'),'utf8');
 assert.match(app,/report\.optionalTasks\.done\+'\/'\+report\.optionalTasks\.total\+' 완료/);
 assert.doesNotMatch(app,/campaignUnlocked\s*=\s*true/);
});
