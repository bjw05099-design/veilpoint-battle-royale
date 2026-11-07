'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Story=require('../src/story-slice.js');
const Radio=require('../src/story-comms.js');
test('the captain can prioritize live evacuation without being ordered to fetch two records',()=>{
 const s=Story.createState(),opening=JSON.stringify(s);
 s.phase='records';
 const line=Radio.briefing(s);
 assert.equal(line.speaker,'김지윤');
 assert.match(line.message,/남쪽 주민 이동/);
 assert.match(line.message,/별도 과정/);
 assert.doesNotMatch(line.message,/04:07|04:12/);
 assert.deepEqual(Story.markers(Story.createState()).map(m=>m.id),['terminal'],
  'the comms layer does not insert another task or revise opening progression');
 assert.ok(Object.isFrozen(line));
 assert.equal(JSON.stringify(Story.createState()),opening);
});
test('approaching south corridor yields local testimony, but never a fabricated arrival',()=>{
 const s=Story.createState();s.phase='exit';s.choice='evacuation';
 s.passageWarningHeard=true;
 const before=JSON.stringify(s),line=Radio.briefing(s);
 assert.equal(line.speaker,'유수프 라할');
 assert.match(line.message,/주민 인도를 진행 중/);
 assert.match(line.message,/도착 여부는 아직 확인되지/);
 assert.doesNotMatch(line.message,/탑승 완료|복귀 확정/);
 assert.equal(JSON.stringify(s),before);
 s.guide.active=true;
 assert.equal(Radio.briefing(s).speaker,'조현지',
  'the live escort status is more relevant than background chatter');
 s.guide.arrived=true;
 assert.match(Radio.briefing(s).message,/도착 또는 구조단 인계/);
});
test('east corridor acknowledgment never overrides confirmed records or invents a cleared return route',()=>{
 const s=Story.createState();s.phase='exit';s.choice='verification';s.passageWarningHeard=true;
 let line=Radio.briefing(s);
 assert.equal(line.speaker,'조현지');
 assert.match(line.message,/직접 도착했지만/);
 assert.match(line.message,/한국 출국 전 복귀 계획/);
 assert.match(line.message,/아직 없습니다/);
 s.gateLogReviewed=true;
 line=Radio.briefing(s);
 assert.equal(line.speaker,'김지윤');
 assert.match(line.message,/재전송/);
 s.logHandedOff=true;
 line=Radio.briefing(s);
 assert.equal(line.speaker,'조현지');
 assert.match(line.message,/후속 분석/);
});
