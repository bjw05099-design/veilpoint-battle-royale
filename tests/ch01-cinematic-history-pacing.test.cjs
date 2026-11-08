'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const Story=require('../src/story-slice.js');
test('three short playable opening beats preserve Korea briefing -> arrival -> unforeseen escalation',()=>{
 const state=Story.createState(),segments=[
  {at:0,location:/대한민국/,spoken:/한국에서 확인했다/},
  {at:3.5,location:/가상 해안 도시 나흐린/,spoken:/유수프 구조단/},
  {at:7,location:/도착 후/,spoken:/충돌이 예상보다 빠르게 확대/}
 ];
 for(const segment of segments){
  state.world.elapsed=segment.at;
  const cue=Story.openingBeat(state);
  assert.ok(cue,'each original scene must remain physically timed');
  assert.match(cue.location,segment.location);
  assert.match(cue.subtitle,segment.spoken);
  assert.ok([...cue.subtitle].length<=100,
   'a roughly 3-second cinematic cannot carry a history lecture');
  assert.doesNotMatch(cue.subtitle,/1990|1994|2011|2014|2019|2022/,
   'historical context is heard from actual witnesses at the right location');
 }
 state.world.elapsed=10.3;
 assert.equal(Story.openingBeat(state),null);
 assert.equal(state.deploymentReviewed,false,
  'no new local order-collection gate is inserted');
});
test('CH01 completed scene reports limits as character speech, not an omniscient history lecture',()=>{
 const state=Story.createState();
 state.choice='evacuation';state.phase='complete';
 const lines=Story.closingScene(state).lines;
 assert.equal(lines.length,4);
 assert.match(lines[3],/우리가 확인한 것과 모르는 것/);
 assert.match(lines[3],/복귀는 다시 승인받아야 합니다/);
 assert.doesNotMatch(lines[3],/모든 남부 주민의 견해로 일반화하지 않습니다/);
 state.workerInterviewed=true;
 const witnessed=Story.closingScene(state).lines[3];
 assert.match(witnessed,/그 가족의 말을 도시 전체의 목소리로 적지 않겠습니다/);
 assert.doesNotMatch(lines[3],/작업자의 가족은 통일과 전쟁/,
  'unheard testimony must remain absent');
 assert.equal(Story.VERSION,2);
});
test('full historical background remains documented, without being forced into the ten-second playable HUD',()=>{
 const guide=fs.readFileSync(path.resolve(__dirname,'../docs/VEILPOINT_STORY_HISTORICAL_DRAMA_KO.md'),'utf8');
 for(const year of ['1990','1994','2011','2014','2015','2019','2022'])
  assert.ok(guide.includes(year),'missing verified background '+year);
 assert.match(guide,/아직 제작되지 않았다/);
 assert.match(guide,/실재의 역사/);
 assert.match(guide,/허구의 사건/);
});
