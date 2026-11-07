'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Story=require('../src/story-slice.js');
const go=(state,point)=>{state.world.player.x=point.x;state.world.player.z=point.z;};

test('CH01 core escape path is playable without any additional paper investigation tasks',()=>{
 const state=Story.createState();
 assert.equal(state.phase,'terminal');
 assert.deepEqual(Story.markers(state).map(m=>m.id),['terminal']);
 go(state,Story.POINTS.terminal);
 assert.equal(Story.interact(state).phase,'engagement');
 // Unit setup represents a successfully completed authentic local encounter,
 // not an invented player action or fake in-game scripted combat scene.
 state.world.bots.forEach(b=>{b.health=0;b.alive=false;});
 state.combat.cleared=true;state.phase='records';
 assert.deepEqual(state.found,[]);
 assert.equal(state.deploymentReviewed,false);
 go(state,Story.POINTS.decision);
 assert.equal(Story.interact(state).phase,'decision');
 assert.match(Story.objective(state),/남쪽 대피 지원은 바로 선택할 수 있습니다/);
 assert.equal(Story.choose(state,'evacuation').ok,true,
  'civilian protection route must be independent of all optional record comparisons');
 assert.deepEqual(state.found,[]);
 assert.equal(state.officeBoardRead,false);
 assert.equal(state.waterSurveyed,false);
 assert.equal(state.dispatchReviewed,false);
 go(state,Story.POINTS.exitEvac);
 assert.equal(Story.interact(state).phase,'complete',
  'captain and local responders can progress without any arbitrary document errands');
 const end=Story.debrief(state);
 assert.equal(end.route,'evacuation');
 assert.equal(end.deploymentReviewed,false);
 assert.equal(end.records.length,0);
 assert.doesNotMatch(end.summary,/최초 파견 지시서를 직접 확인/);
});
