'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Story=require('../src/story-slice.js');
const Comms=require('../src/story-comms.js');
const go=(s,id)=>{s.world.player.x=Story.POINTS[id].x;s.world.player.z=Story.POINTS[id].z;};
function southRoute(){
 const s=Story.createState();go(s,'terminal');
 assert.equal(Story.interact(s).ok,true);
 for(const b of s.world.bots)for(let i=0;i<2;i++){
  s.world.player.yaw=Math.atan2(b.x-s.world.player.x,-(b.z-s.world.player.z));
  s.world.player.pitch=0;s.world.elapsed+=.21;
  assert.equal(Story.fire(s).hit,true);
 }
 assert.equal(s.phase,'records');go(s,'decision');
 assert.equal(Story.interact(s).ok,true);
 assert.equal(Story.choose(s,'evacuation').ok,true);
 return s;
}
test('driver testimony needs direct contact and the separate staffed intake ledger',()=>{
 const s=southRoute();
 assert.equal(Story.markers(s).some(x=>x.id==='driverReportDesk'),false);
 go(s,'dispatchLedger');assert.equal(Story.interact(s).ok,true);
 assert.equal(Story.markers(s).some(x=>x.id==='driverReportDesk'),false);
 go(s,'transportDriver');
 assert.equal(Story.interact(s).ok,true);
 assert.equal(s.transportContact,1);
 assert.equal(Story.markers(s).some(x=>x.id==='driverReportDesk'),false);
 assert.equal(Story.interact(s).ok,true);
 assert.equal(s.transportContact,2);
 assert.equal(Story.markers(s).some(x=>x.id==='driverReportDesk'),true);
 assert.equal(Story.nearest(s)?.id==='driverReportDesk',false,
  'a cross-harbor remote E press cannot file a witness statement');
 const before=Story.serialize(s);
 assert.equal(Story.interact(s).ok,false);
 assert.equal(Story.serialize(s),before);
 go(s,'driverReportDesk');
 assert.equal(Story.nearest(s).id,'driverReportDesk');
 assert.equal(Story.interact(s).ok,true);
 assert.equal(s.driverReportFiled,true);
 assert.match(s.subtitle,/차량 도착 증빙은 없습니다/);
 assert.equal(Story.markers(s).some(x=>x.id==='driverReportDesk'),false);
 assert.equal(Story.missionTasks(s).find(x=>x.id==='driver-report').status,'done');
 assert.match(Comms.briefing(s).message,/후속 확인/);
 const save=Story.serialize(s),restored=Story.restore(save);
 assert.equal(restored.driverReportFiled,true);
 assert.equal(Story.serialize(restored),save);
 go(restored,'exitEvac');
 assert.equal(Story.interact(restored).ok,true);
 const debrief=Story.debrief(restored);
 assert.equal(debrief.driverReportFiled,true);
 assert.match(debrief.summary,/차량 도착은 확인되지 않았/);
});
test('no mandatory filing, legacy saves and invalid forged evidence are handled separately',()=>{
 const s=southRoute(),old=JSON.parse(Story.serialize(s));
 delete old.driverReportFiled;
 assert.equal(Story.restore(JSON.stringify(old)).driverReportFiled,false);
 const forged={...old,driverReportFiled:true};
 assert.throws(()=>Story.restore(JSON.stringify(forged)),RangeError);
 go(s,'transportDriver');
 Story.interact(s);Story.interact(s);
 const noLedger=JSON.parse(Story.serialize(s));
 noLedger.driverReportFiled=true;
 assert.throws(()=>Story.restore(JSON.stringify(noLedger)),RangeError);
 go(s,'exitEvac');
 assert.equal(Story.interact(s).ok,true,'optional testimony cannot soft-lock evacuation');
 assert.equal(Story.debrief(s).driverReportFiled,false);
});
