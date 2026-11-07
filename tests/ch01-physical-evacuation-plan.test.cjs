'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Story=require('../src/story-slice.js');
const Journal=require('../src/field-journal.js');
const Comms=require('../src/story-comms.js');
const go=(s,id)=>{s.world.player.x=Story.POINTS[id].x;s.world.player.z=Story.POINTS[id].z;};
function evacuation(){
 const s=Story.createState();
 go(s,'terminal');assert.equal(Story.interact(s).ok,true);
 for(const bot of s.world.bots)for(let i=0;i<2;i++){
  s.world.player.yaw=Math.atan2(bot.x-s.world.player.x,-(bot.z-s.world.player.z));
  s.world.player.pitch=0;s.world.elapsed+=.21;
  assert.equal(Story.fire(s).hit,true);
 }
 assert.equal(s.phase,'records');
 go(s,'decision');assert.equal(Story.interact(s).ok,true);
 assert.equal(Story.choose(s,'evacuation').ok,true);
 return s;
}
test('CH01 evacuation plan requires real marker reach and independently earned E review',()=>{
 const s=evacuation();
 assert.equal(s.planReviewed,false);
 assert.ok(Story.markers(s).some(p=>p.id==='evacPlan'));
 assert.equal(Story.interact(s).ok,false,'remote notice must not activate');
 const task=Story.missionTasks(s).find(x=>x.id==='plan');
 assert.ok(task&&task.optional&&task.status==='available');
 go(s,'evacPlan');assert.equal(Story.nearest(s).id,'evacPlan');
 assert.deepEqual(Story.interact(s),{ok:true,event:'evacPlan',phase:'exit'});
 assert.equal(s.planReviewed,true);
 assert.equal(s.musterConfirmed,false);
 assert.equal(s.aidDelivered,false);
 assert.equal(s.guide.active,false);
 assert.ok(!Story.markers(s).some(p=>p.id==='evacPlan'));
 assert.equal(Story.missionTasks(s).find(x=>x.id==='plan').status,'done');
 assert.match(Journal.entries(s).find(x=>x.id==='plan').detail,/현지 구조단/);
 assert.match(Comms.briefing(s).message,/대피 계획을 확인/);
});
test('CH01 physical plan review survives checkpoint without breaking older saved generations',()=>{
 const s=evacuation();
 go(s,'evacPlan');Story.interact(s);
 const saved=Story.serialize(s),restored=Story.restore(saved);
 assert.equal(restored.planReviewed,true);
 assert.equal(Story.serialize(restored),saved,'roundtrip remains byte stable');
 const older=JSON.parse(saved);
 delete older.planReviewed;
 const migrated=Story.restore(JSON.stringify(older));
 assert.equal(migrated.planReviewed,false);
 assert.equal(Story.missionTasks(migrated).find(x=>x.id==='plan').status,'available');
 const fresh=evacuation();
 go(fresh,'exitEvac');
 assert.equal(Story.interact(fresh).ok,true,'plan remains optional for a playable exit');
});
test('CH01 rejects forged early, wrong-route and non-boolean plan confirmations',()=>{
 const early=JSON.parse(Story.serialize(Story.createState()));
 early.planReviewed=true;
 assert.throws(()=>Story.restore(JSON.stringify(early)),RangeError);
 const s=evacuation(),valid=JSON.parse(Story.serialize(s));
 for(const bad of ['true',1,null])
  assert.throws(()=>Story.restore(JSON.stringify({...valid,planReviewed:bad})),RangeError);
 assert.throws(()=>Story.restore(JSON.stringify({...valid,choice:'verification',planReviewed:true})),RangeError);
});
