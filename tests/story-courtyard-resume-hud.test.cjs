'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Story=require('../src/story-slice.js');

function waitingAtCourtyard(){
 const legacy={version:1,phase:'exit',found:[],choice:'evacuation',
   player:{x:-9,z:-55,yaw:0,pitch:0,stamina:100},elapsed:12};
 const s=Story.restore(JSON.stringify(legacy));
 s.world.player.x=Story.POINTS.muster.x;
 s.world.player.z=Story.POINTS.muster.z;
 assert.equal(Story.interact(s).event,'muster');
 assert.equal(Story.interact(s).event,'guide');
 const exit=Story.POINTS.exitEvac;
 s.guide.x=exit.x+1.9;s.guide.z=exit.z;s.guide.waiting=true;
 s.world.player.x=exit.x;s.world.player.z=exit.z;
 return s;
}

test('CH01 staffed courtyard F hint resumes nearby held escort before completing route',()=>{
 const s=waitingAtCourtyard();
 assert.equal(Story.nearest(s)?.id,'exitEvac','exit is the actual F target');
 assert.match(Story.situation(s).guideStatus,/출구에서 F로 동행 재개/);
 const saved=Story.serialize(s);
 const recovered=Story.restore(saved);
 assert.equal(Story.situation(recovered).guideStatus,Story.situation(s).guideStatus);
 assert.equal(Story.serialize(recovered),saved,'the HUD is read-only after refresh');
 assert.equal(Story.interact(recovered).event,'guide_resume_at_exit');
 assert.equal(recovered.phase,'exit','resume is not a phantom completion');
 assert.equal(recovered.guide.waiting,false);
 Story.step(recovered,1/60,{});
 assert.equal(recovered.guide.arrived,true,'physical fixed tick confirms arrival');
 const arrived=Story.serialize(recovered);
 const next=Story.restore(arrived);
 assert.equal(next.guide.arrived,true);
 assert.equal(Story.interact(next).ok,true);
 assert.equal(next.phase,'complete');
 assert.equal(Story.debrief(next).guideArrived,true);
});

test('CH01 blocked civilian line cannot show courtyard resume or silently end the mission',()=>{
 const s=waitingAtCourtyard(),exit=Story.POINTS.exitEvac;
 // An occupied passage blocks the real contact: even at the exit desk the
 // player must return by a physically walkable route, not press F remotely.
 s.world.obstacles.push({x:exit.x+0.95,z:exit.z,w:.35,d:1.6,type:'story-container'});
 assert.equal(Story.nearest(s)?.id,'exitEvac');
 assert.doesNotMatch(Story.situation(s).guideStatus,/출구에서 F로 동행 재개/);
 const before=Story.serialize(s);
 const result=Story.interact(s);
 assert.equal(result.ok,false);
 assert.equal(result.reason,'guide_not_arrived');
 assert.equal(s.phase,'exit');
 assert.equal(s.guide.waiting,true);
 assert.equal(Story.serialize(s),before,'blocked interaction does not forge a saved ending');
});
