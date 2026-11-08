'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Story=require('../src/story-slice.js');

test('2015-set CH01 cannot give characters knowledge of later Yemen agreements',()=>{
  const root=path.resolve(__dirname,'..');
  const source=fs.readFileSync(path.join(root,'src/story-slice.js'),'utf8');
  const background=fs.readFileSync(path.join(root,'docs/VEILPOINT_STORY_HISTORICAL_DRAMA_KO.md'),'utf8');
  assert.match(background,/2015년 봄~여름/);
  assert.match(background,/2019년.*2022년.*후대 참고 자료/);
  assert.doesNotMatch(source,/2019년|2022년|리야드 합의/);
  assert.match(source,/2011년 예멘의 시위/);
  assert.match(source,/2014년 사나.*2015년 .*아덴/);
});

test('the 2015 chronology correction never changes CH01 v2 checkpoint bytes or the arrival cause',()=>{
  const state=Story.createState();
  const old=Story.serialize(state);
  assert.equal(Story.serialize(Story.restore(old)),old);
  assert.equal(Story.VERSION,2);
  assert.equal(state.deploymentReviewed,false);
  assert.match(Story.openingBeat(state).subtitle,/한국에서 확인했다/);
  state.world.player.x=Story.POINTS.terminal.x;
  state.world.player.z=Story.POINTS.terminal.z;
  assert.equal(Story.interact(state).phase,'engagement');
  assert.match(state.subtitle,/내전이 예상 밖으로 확대/);
  assert.doesNotMatch(state.subtitle,/2019|2022/);
});
