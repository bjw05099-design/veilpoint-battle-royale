'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Story=require('../src/story-slice.js');
const Comms=require('../src/story-comms.js');

test('CH01 radio reports actual civilian escort wait and completion rather than inventing outcomes',()=>{
 const state=Story.createState();
 state.phase='exit';state.choice='evacuation';
 state.musterConfirmed=true;state.guide.active=true;
 const before=JSON.stringify(state);
 let message=Comms.briefing(state);
 assert.equal(message.speaker,'조현지');
 assert.match(message.message,/실제 도착 또는 구조단 인계 전/);
 assert.doesNotMatch(message.message,/완료했습니다/);
 state.guide.waiting=true;
 message=Comms.briefing(state);
 assert.match(message.message,/현장 대기/);
 assert.match(message.message,/직접 다시 접근/);
 assert.equal(JSON.stringify(state),before.replace('"waiting":false','"waiting":true'),
   'radio read changes no physical state');
 state.guide.waiting=false;state.guide.released=true;state.guide.active=false;
 message=Comms.briefing(state);
 assert.match(message.message,/도착 또는 구조단 인계/);
 assert.ok(Object.isFrozen(message));
});
test('undelivered aid stays explicitly pending and confirmed handoff takes priority',()=>{
 const state=Story.createState();
 state.phase='exit';state.choice='evacuation';state.world.carryingAid=true;
 let message=Comms.briefing(state);
 assert.equal(message.speaker,'이수혁 대위');
 assert.match(message.message,/직접 운반 중/);
 assert.match(message.message,/인계하기 전/);
 state.world.carryingAid=false;state.aidStaged=true;
 message=Comms.briefing(state);
 assert.match(message.message,/적재대/);
 assert.match(message.message,/인계는 아직/);
 state.aidDelivered=true;state.aidStaged=false;
 message=Comms.briefing(state);
 assert.match(message.message,/인계를 확인/);
});
