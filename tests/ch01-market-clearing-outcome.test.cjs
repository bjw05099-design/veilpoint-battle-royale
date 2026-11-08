'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Story=require('../src/story-slice.js');
function completed(shift,fallen=true){
 const state=Story.createState();
 state.phase='complete';state.choice='evacuation';
 state.awningFallen=fallen;state.awningShift=shift;
 return state;
}
test('CH01 reports physical walkway clearance as a witnessed optional outcome, not a task gate',()=>{
 const cleared=completed(1),report=Story.debrief(cleared);
 assert.equal(report.marketWalkwayCleared,true);
 assert.match(report.summary,/차양을 실제로 옮겨/);
 assert.ok(report.closingScene.lines.some(line=>/차양은 통행 구역에서 치웠/.test(line)));
 const pending=Story.debrief(completed(.5));
 assert.equal(pending.marketWalkwayCleared,false);
 assert.ok(pending.closingScene.lines.some(line=>/차양이 아직 남아/.test(line)));
 assert.doesNotMatch(pending.summary,/통행 공간을 확보했습니다/);
 const legacy=Story.debrief(completed(0,false));
 assert.equal(legacy.marketWalkwayCleared,false);
 assert.equal(legacy.closingScene.lines.some(line=>/시장 차양|쓰러진 차양/.test(line)),false);
 assert.equal(Story.createState().phase,'terminal');
});
