'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Story=require('../src/story-slice.js');
function startEncounter(){
 const s=Story.createState();
 s.world.player.x=Story.POINTS.terminal.x;
 s.world.player.z=Story.POINTS.terminal.z;
 assert.equal(Story.interact(s).phase,'engagement');
 return s;
}
test('CH01 optional active liaison acknowledges the briefing already received in Korea without requiring papers',()=>{
 const state=startEncounter();
 const reply=Story.support(state);
 assert.equal(reply.ok,true);
 assert.match(state.subtitle,/한국에서 전달된 최초 파견 임무/);
 assert.match(state.subtitle,/현지 연락망 확인과 구호 인력 지원/);
 assert.match(state.subtitle,/유수프 구조단과 직접 협의/);
 assert.equal(Story.support(state).reason,'already_used');
 const saved=Story.serialize(state),restored=Story.restore(saved);
 assert.equal(restored.combat.supportUsed,true,'existing v2 checkpoint records the same real in-play choice');
 assert.equal(Story.serialize(restored),saved);
});
test('CH01 briefing dialogue branches on actual player liaison call without altering either physical route gate',()=>{
 for(const contact of [false,true]){
  const state=startEncounter();
  if(contact)Story.support(state);
  // Existing route decisions are still available after the actual encounter.
  state.world.bots.forEach(bot=>{bot.alive=false;bot.health=0;});
  state.combat.cleared=true;state.phase='decision';
  const choice=Story.choose(state,'evacuation');
  assert.equal(choice.ok,true);
  assert.equal(state.phase,'exit');
  state.phase='complete';
  const report=Story.debrief(state);
  // His Korean predeparture briefing occurred regardless of an OPTIONAL
  // later field liaison call. The latter is independently observable.
  assert.equal(report.predepartureBriefingAcknowledged,true);
  assert.equal(report.verifiedInformationOnly,contact);
  assert.equal(report.closingScene.lines.length,4);
  assert.match(report.closingScene.lines[2],/본래 복귀 일정|한국에서 승인받은 복귀 일정/);
  assert.equal(report.closingScene.lines[2].includes('교전 중 교신은 원래 파견 지시를 변경하지 않았습니다'),contact);
  assert.equal(report.route,'evacuation');
  assert.equal(report.campaignUnlocked,false);
 }
});
