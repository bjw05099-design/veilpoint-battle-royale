'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Story=require('../src/story-slice.js');
const Journal=require('../src/field-journal.js');

test('CH01 field journal earns each civilian outcome only after its actual world-state transition',()=>{
  const state=Story.createState();
  const initial=Journal.entries(state);
  assert.equal(initial.length,2);
  assert.equal(initial.every(entry=>entry.unlocked===false),true);
  assert.equal(initial.some(entry=>entry.id==='route'),false);
  assert.equal(initial.some(entry=>entry.id==='guide'||entry.id==='aid'),false);
  state.choice='evacuation';
  let entries=Journal.entries(state);
  assert.match(entries.find(entry=>entry.id==='route').detail,/선택 과제/);
  assert.equal(entries.some(entry=>entry.id==='muster'),false);
  state.musterConfirmed=true;
  entries=Journal.entries(state);
  assert.match(entries.find(entry=>entry.id==='muster').detail,/직접 대조/);
  state.aidPickedUp=true;
  assert.match(Journal.entries(state).find(entry=>entry.id==='aid').detail,/운반 중/);
  state.aidStaged=true;
  assert.match(Journal.entries(state).find(entry=>entry.id==='aid').detail,/임시 적재대/);
  assert.doesNotMatch(Journal.entries(state).find(entry=>entry.id==='aid').detail,/직접 전달했다/);
  state.aidDelivered=true;state.aidStaged=false;
  assert.match(Journal.entries(state).find(entry=>entry.id==='aid').detail,/직접 전달했다/);
  state.guide.active=true;state.guide.waiting=true;
  assert.match(Journal.entries(state).find(entry=>entry.id==='guide').detail,/대기 중/);
  state.guide.waiting=false;
  assert.match(Journal.entries(state).find(entry=>entry.id==='guide').detail,/함께 이동 중/);
  state.guide.arrived=true;
  assert.match(Journal.entries(state).find(entry=>entry.id==='guide').detail,/안뜰에 도착/);
  state.guide.released=true;
  assert.match(Journal.entries(state).find(entry=>entry.id==='guide').detail,/직접 인계/);
  entries=Journal.entries(state);
  assert.ok(Object.isFrozen(entries));
  assert.ok(entries.every(Object.isFrozen));
});

test('CH01 journal keeps unknown signal evidence hidden and a read-only route record across reload',()=>{
  const state=Story.createState();
  const before=Story.serialize(state);
  Journal.entries(state);
  assert.equal(Story.serialize(state),before);
  state.phase='decision';
  state.choice='verification';
  state.found=['recordB'];
  let rows=Journal.entries(state);
  assert.equal(rows[0].unlocked,false);
  assert.equal(rows[1].unlocked,true);
  assert.equal(rows.some(row=>row.id==='comparison'||row.id==='gateLog'),false);
  assert.match(rows.find(row=>row.id==='route').detail,/동쪽 통제문/);
  assert.equal(JSON.stringify(rows).includes('04:12'),false,'unfound harbor record is not disclosed');
  state.found.push('recordA');
  rows=Journal.entries(state);
  assert.match(rows.find(row=>row.id==='comparison').detail,/원인은 아직 확정되지/);
  state.gateLogReviewed=true;
  rows=Journal.entries(state);
  assert.match(rows.find(row=>row.id==='gateLog').detail,/동일 메시지 재전송/);
  assert.equal(rows.find(row=>row.id==='gateLog').detail.includes('접수 완료'),false);
  state.logHandedOff=true;
  assert.match(Journal.entries(state).find(row=>row.id==='gateLog').detail,/접수 완료/);
});


test('CH01 journal route tracks the actual 60Hz clearance clock across a checkpoint restore',()=>{
 const legacy={version:1,phase:'exit',found:['recordA','recordB'],choice:'verification',
  player:{x:0,z:12,yaw:0,pitch:0,stamina:100},elapsed:10};
 const state=Story.restore(JSON.stringify(legacy));
 state.gateReadyAt=18;state.gateClearanceDuration=8;
 let rows=Journal.entries(state);
 assert.match(rows.find(row=>row.id==='route').detail,/개방 요청 접수/);
 assert.doesNotMatch(rows.find(row=>row.id==='route').detail,/개방 확인/);
 assert.equal(rows.some(row=>row.id==='gateLog'),false,'unreviewed record stays undisclosed');
 const before=Story.serialize(state);
 Journal.entries(state);
 assert.equal(Story.serialize(state),before,'journal reads must not advance or alter a mission');
 state.world.elapsed=17.99;
 assert.match(Journal.entries(state).find(row=>row.id==='route').detail,/통과할 수 없다/);
 state.world.elapsed=18;
 assert.match(Journal.entries(state).find(row=>row.id==='route').detail,/개방 확인/);
 assert.equal(Journal.entries(state).some(row=>row.id==='gateLog'),false);
 assert.match(Journal.entries(Story.restore(Story.serialize(state))).find(row=>row.id==='route').detail,/개방 확인/);
 state.gateLogReviewed=true;
 assert.match(Journal.entries(state).find(row=>row.id==='gateLog').detail,/전달 전/);
 assert.equal(Journal.entries(state).find(row=>row.id==='route').unlocked,true);
});


test('CH01 earned radio and beacon evidence enters the journal only after physical state confirmation',()=>{
 const fresh=Story.createState(),initial=Story.serialize(fresh);
 assert.deepEqual(Journal.entries(fresh).map(x=>x.id),['recordA','recordB']);
 assert.equal(Story.serialize(fresh),initial);
 // Do not forge post-mission progress into an impossible terminal checkpoint.
 const savedLegacy={version:1,phase:'exit',found:['recordA','recordB'],choice:'verification',
  player:{x:0,z:12,yaw:0,pitch:0,stamina:100},elapsed:10};
 const state=Story.restore(JSON.stringify(savedLegacy));
 state.combat.supportUsed=true;
 let rows=Journal.entries(state);
 assert.match(rows.find(x=>x.id==='support').detail,/현장에서 동료 상황 보고/);
 assert.equal(rows.some(x=>x.id==='relay'||x.id==='beacon'),false);
 state.beaconEnabled=true; // invalid out-of-order external fixture: cannot claim restored power.
 assert.equal(Journal.entries(state).some(x=>x.id==='beacon'),false);
 state.beaconEnabled=false;
 state.relayRestored=true;
 rows=Journal.entries(state);
 assert.match(rows.find(x=>x.id==='relay').detail,/직접 연결/);
 assert.equal(rows.some(x=>x.id==='beacon'),false);
 const saved=Story.serialize(state);
 rows=Journal.entries(Story.restore(saved));
 assert.match(rows.find(x=>x.id==='relay').detail,/비상 무전/);
 assert.equal(rows.some(x=>x.id==='beacon'),false);
 state.beaconEnabled=true;
 const before=Story.serialize(state);
 rows=Journal.entries(state);
 assert.match(rows.find(x=>x.id==='beacon').detail,/현장 스위치를 직접 작동/);
 assert.equal(Story.serialize(state),before,'read-only log never changes the 60Hz world');
 assert.ok(rows.every(Object.isFrozen));
 state.beaconEnabled=false;
 assert.equal(Journal.entries(state).some(x=>x.id==='beacon'),false,
  'turning a manual warning light off must not falsely claim it remains active');
});
