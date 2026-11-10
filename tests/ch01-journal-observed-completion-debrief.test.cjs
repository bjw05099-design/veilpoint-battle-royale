'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Story=require('../src/story-slice.js');
const Journal=require('../src/field-journal.js');
const Civic=require('../src/ch01-civic-recovery.cjs');
const row=(s,id)=>Journal.entries(s).find(x=>x.id===id);
test('selecting the south escape never falsely certifies completed public access',()=>{
 const state=Story.createState(),original=Story.serialize(state);
 assert.equal(row(state,'route'),undefined);
 state.choice='evacuation';state.phase='exit';
 assert.match(row(state,'route').detail,/선택했다/);
 assert.match(row(state,'route').detail,/현장 확보는 아직 확인되지/);
 assert.doesNotMatch(row(state,'route').detail,/통로를 확보했다/);
 assert.equal(row(state,'debrief'),undefined);
 const serialized=JSON.stringify(state);
 Journal.entries(state);assert.equal(JSON.stringify(state),serialized,
  'the story journal never mutates the live 60Hz world or checkpoint');
 assert.equal(Story.serialize(Story.createState()),original);
});
test('CH01 final debrief reports actual handoff over prior guide arrival and distinguishes an active escort',()=>{
 const s=Story.createState();
 s.choice='evacuation';s.phase='complete';s.world.status='won';
 s.guide.active=true;s.guide.waiting=true;
 assert.match(row(s,'debrief').detail,/안내원 현장 대기 · 목적지 미도착/);
 s.guide.waiting=false;
 assert.match(row(s,'debrief').detail,/안내원 동행 중 · 목적지 미도착/);
 s.guide.arrived=true;
 assert.match(row(s,'debrief').detail,/안내원 안뜰 도착 · 구조단 인계 미완료/);
 s.guide.released=true;
 assert.match(row(s,'debrief').detail,/안내원 구조단 인계 완료/);
 assert.doesNotMatch(row(s,'debrief').detail,/안내원 안뜰 도착 · 구조단 인계 미완료/);
 assert.match(row(s,'guide').detail,/직접 인계/);
 assert.match(row(s,'route').detail,/실제 출구를 통과했다/);
});
test('after local spoken crossing assistance the debrief stays unverified until 60Hz actual arrival',()=>{
 const s=Story.createState();s.choice='evacuation';s.phase='complete';s.world.status='won';
 const first=Civic.step(Civic.initial(),{
  disruption:true,assist:true,player:{x:6,z:-16}
 });
 s.civicCrossing=first;
 assert.match(row(s,'debrief').detail,/실제 건너편 도착 미확인/);
 assert.match(row(s,'civicCrossing').detail,/아직 확인되지/);
 let crossing=first;
 for(let i=0;i<550;i++)
  crossing=Civic.step(crossing,{player:{x:-20,z:0}});
 s.civicCrossing=crossing;
 assert.deepEqual(crossing.civilian,crossing.destination);
 assert.match(row(s,'debrief').detail,/한 명이 실제로 건너편 보행로에 도착/);
 assert.doesNotMatch(row(s,'debrief').detail,/실제 건너편 도착 미확인/);
 assert.match(row(s,'civicCrossing').detail,/실제로 건너편 보행로에 도착/);
 const unchanged=JSON.stringify(s);
 Journal.entries(s);assert.equal(JSON.stringify(s),unchanged);
 s.phase='exit';assert.equal(row(s,'debrief'),undefined,
  'a physical arrival by itself is not a completed CH01 extraction');
});
