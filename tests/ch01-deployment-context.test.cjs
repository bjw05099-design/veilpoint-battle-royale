'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Story=require('../src/story-slice.js');
const Comms=require('../src/story-comms.js');
test('captain already knew authorized mission before unexpected escalation',()=>{
 const s=Story.createState();s.phase='terminal';
 const before=JSON.stringify(s),line=Comms.briefing(s);
 assert.equal(line.speaker,'이수혁 대위');
 assert.match(line.message,/출국 전 승인된/);
 assert.match(line.message,/예정에 없던 교전/);
 assert.doesNotMatch(line.message,/파견 지시서를 찾|명령서를 수집/);
 assert.equal(JSON.stringify(s),before);
 s.phase='engagement';
 const combat=Comms.briefing(s);
 assert.match(combat.message,/출국 전 계획에 없던 충돌/);
 assert.equal(s.phase,'engagement');
});
