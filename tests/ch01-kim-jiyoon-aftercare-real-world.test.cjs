'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Story=require('../src/story-slice.js');
function actualAftermath(){
 const s=Story.createState();
 s.world.player.x=Story.POINTS.terminal.x;
 s.world.player.z=Story.POINTS.terminal.z;
 assert.equal(Story.interact(s).phase,'engagement');
 for(const b of s.world.bots){b.health=0;b.alive=false;}
 s.phase='records';s.combat.cleared=true;
 Story.step(s,1/60,{});
 return s;
}
const stand=(s,x,z)=>{s.world.player.x=x;s.world.player.z=z;};
test('Kim Jiyoon optional CH01 aftermath is a face-to-face F interaction tied to a witnessed event, not a map quest',()=>{
 const state=actualAftermath();
 stand(state,-3,11);
 assert.equal(state.kimAftercareReviewed,false);
 assert.equal(Story.markers(state).some(m=>m.id==='kimAftercare'),false,
   'an unobserved event cannot create an optional conversation');
 state.workerInterviewed=true;
 assert.equal(Story.markers(state).some(m=>m.id==='kimAftercare'),true);
 assert.equal(Story.nearest(state)?.id,'kimAftercare');
 const originalChoice=state.choice;
 const interaction=Story.interact(state);
 assert.deepEqual(interaction,{ok:true,event:'kim_local_aftercare',phase:'records'});
 assert.match(state.subtitle,/김지윤/);
 assert.match(state.subtitle,/작업자의 직접 진술/);
 assert.equal(state.kimAftercareReviewed,true);
 assert.equal(state.choice,originalChoice);
 assert.equal(state.gateReadyAt,0);
 assert.deepEqual(state.found,[]);
 assert.equal(Story.markers(state).some(m=>m.id==='kimAftercare'),false,
   'this optional conversation is not a repeatable credit generator');
 const saved=Story.serialize(state),restored=Story.restore(saved);
 assert.equal(Story.serialize(restored),saved);
 assert.equal(restored.kimAftercareReviewed,true);
 assert.equal(restored.world.kimJiyoon.role,'kim-jiyoon');
 restored.phase='complete';restored.choice='evacuation';
 const closing=Story.closingScene(restored);
 assert.match(closing.lines.join(' '),/김지윤은 현장에서 직접 확인된/);
 assert.equal(Story.debrief(restored).kimAftercareWitnessed,true);
 assert.equal(Story.debrief(restored).campaignUnlocked,false);
});
test('CH01 aftercare cannot be triggered through a wall, from across town or before incident',()=>{
 const early=Story.createState();
 early.workerInterviewed=true;
 stand(early,-3,11);
 assert.notEqual(Story.nearest(early)?.id,'kimAftercare',
   'the pre-incident phase must never offer a future witnessed conversation');
 const state=actualAftermath();
 state.workerInterviewed=true;
 stand(state,80,85);
 assert.equal(Story.markers(state).some(m=>m.id==='kimAftercare'),false);
 stand(state,-3,11);
 const k=state.kimJiyoon,p=state.world.player;
 const occluder={x:(k.x+p.x)/2,z:(k.z+p.z)/2,w:1.5,d:.6,h:3,type:'test-wall'};
 state.world.obstacles.push(occluder);
 assert.equal(Story.markers(state).some(m=>m.id==='kimAftercare'),false);
 assert.notEqual(Story.nearest(state)?.id,'kimAftercare');
 state.world.obstacles.pop();
 assert.equal(Story.nearest(state)?.id,'kimAftercare');
});
test('CH01 v2 saved aftercare refuses forged progress and accepts historical saves',()=>{
 const state=actualAftermath(),historic=JSON.parse(Story.serialize(state));
 assert.equal(historic.kimAftercareReviewed,false);
 delete historic.kimAftercareReviewed;
 const old=Story.restore(JSON.stringify(historic));
 assert.equal(old.kimAftercareReviewed,false);
 assert.equal(Story.serialize(Story.restore(Story.serialize(old))),Story.serialize(old));
 assert.throws(()=>Story.restore(JSON.stringify({...historic,
   kimAftercareReviewed:true})),RangeError,
   'unwitnessed true event must not restore as observed aftercare');
 assert.throws(()=>Story.restore(JSON.stringify({...historic,
   kimAftercareReviewed:'true'})),RangeError,
   'malformed saved flag must not bypass strict V2 checkpoint validation');
 const forged={...historic,workerInterviewed:true,kimJiyoon:null,
   kimAftercareReviewed:true};
 assert.throws(()=>Story.restore(JSON.stringify(forged)),RangeError,
   'a missing physical companion cannot have made the face-to-face report');
});
