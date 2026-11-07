'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Story=require('../src/story-slice.js'),Journal=require('../src/field-journal.js'),Comms=require('../src/story-comms.js');
const go=(s,id)=>{s.world.player.x=Story.POINTS[id].x;s.world.player.z=Story.POINTS[id].z;};
function evac(){
 const legacy={version:1,phase:'exit',found:[],choice:'evacuation',
  player:{x:-9,z:-55,yaw:0,pitch:0,stamina:100},elapsed:12};
 return Story.restore(JSON.stringify(legacy));
}
test('CH01 physical transit plan is optional, unspoiled and inspectable only after muster',()=>{
 const s=evac();
 assert.equal(s.transitReviewed,false);
 assert.equal(Story.markers(s).some(p=>p.id==='transitBoard'),false);
 assert.equal(Story.missionTasks(s).find(t=>t.id==='transit').status,'locked');
 go(s,'muster');assert.equal(Story.interact(s).event,'muster');
 assert.equal(Story.markers(s).some(p=>p.id==='transitBoard'),true);
 assert.equal(Story.missionTasks(s).find(t=>t.id==='transit').status,'available');
 assert.equal(Journal.entries(s).some(e=>e.id==='transit'),false);
 go(s,'transitBoard');
 assert.equal(Story.nearest(s).id,'transitBoard');
 assert.equal(Story.interact(s).event,'transitBoard');
 assert.equal(s.transitReviewed,true);
 assert.equal(Story.missionTasks(s).find(t=>t.id==='transit').status,'done');
 assert.equal(Story.markers(s).some(p=>p.id==='transitBoard'),false);
 assert.match(Journal.entries(s).find(e=>e.id==='transit').detail,/실제 도착은 별도로 확인/);
 assert.match(Comms.briefing(s).message,/이동 계획표/);
});
test('CH01 confirmed board state is durable while legacy v2 saves safely default off',()=>{
 const s=evac();go(s,'muster');Story.interact(s);go(s,'transitBoard');Story.interact(s);
 const saved=Story.serialize(s);
 const recovered=Story.restore(saved);
 assert.equal(recovered.transitReviewed,true);
 assert.equal(Story.serialize(recovered),saved);
 const a=Story.restore(saved),b=Story.restore(saved);
 for(let i=0;i<120;i++){Story.step(a,1/60,{});Story.step(b,1/60,{});}
 assert.equal(Story.serialize(a),Story.serialize(b),'physical progress remains 60Hz deterministic');
 const old=JSON.parse(saved);delete old.transitReviewed;
 const migrated=Story.restore(JSON.stringify(old));
 assert.equal(migrated.transitReviewed,false);
 assert.equal(Story.markers(migrated).some(p=>p.id==='transitBoard'),true);
 go(recovered,'exitEvac');assert.equal(Story.interact(recovered).ok,true);
 assert.equal(Story.debrief(recovered).transitReviewed,true);
});
test('forged field plan cannot be imported before its physical prerequisite or on verification route',()=>{
 const early=JSON.parse(Story.serialize(Story.createState()));
 early.transitReviewed=true;
 assert.throws(()=>Story.restore(JSON.stringify(early)),RangeError);
 const s=evac(),data=JSON.parse(Story.serialize(s));
 data.transitReviewed=true;
 assert.throws(()=>Story.restore(JSON.stringify(data)),RangeError);
 data.musterConfirmed=true;data.choice='verification';
 assert.throws(()=>Story.restore(JSON.stringify(data)),RangeError);
 data.choice='evacuation';data.transitReviewed='yes';
 assert.throws(()=>Story.restore(JSON.stringify(data)),RangeError);
});
