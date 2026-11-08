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
test('driver request produces physical civilian vehicle while old ledger remains optional',()=>{
 const s=southRoute();
 assert.equal(Story.markers(s).some(x=>x.id==='driverReportDesk'),false);
 go(s,'dispatchLedger');assert.equal(Story.interact(s).ok,true);
 go(s,'transportDriver');assert.equal(Story.interact(s).ok,true);
 assert.equal(s.transportContact,1);
 assert.equal(Story.markers(s).some(x=>x.id==='driverReportDesk'),false,
   'real transport should not demand redundant receipt comparison');
 s.world.player.x=0;s.world.player.z=-54;
 for(let i=0;i<1100&&!s.transportVan.arrived;i++)Story.step(s,1/60,{});
 assert.equal(s.transportContact,2);
 assert.equal(s.transportVan.arrived,true);
 assert.equal(Story.markers(s).some(x=>x.id==='driverReportDesk'),false);
 assert.match(Comms.briefing(s).message,/실제 승차 지점/);
 assert.equal(Story.missionTasks(s).some(x=>x.id==='driver-report'),false);
 const save=Story.serialize(s),restored=Story.restore(save);
 assert.equal(Story.serialize(restored),save);
 go(restored,'exitEvac');
 assert.equal(Story.interact(restored).ok,true);
 const report=Story.debrief(restored);
 assert.equal(report.civilianVehicleArrived,true);
 assert.match(report.summary,/승차 지점에 도착/);
});
test('historic optional paperwork remains loadable without inventing a vehicle',()=>{
 const s=southRoute(),old=JSON.parse(Story.serialize(s));
 delete old.transportVan;old.transportContact=2;old.dispatchReviewed=true;
 const legacy=Story.restore(JSON.stringify(old));
 assert.equal(legacy.transportVan,null);
 assert.equal(Story.markers(legacy).some(x=>x.id==='driverReportDesk'),true);
 go(legacy,'driverReportDesk');
 assert.equal(Story.interact(legacy).ok,true);
 assert.equal(legacy.driverReportFiled,true);
 const forged=JSON.parse(Story.serialize(s));
 forged.driverReportFiled=true;
 assert.throws(()=>Story.restore(JSON.stringify(forged)),RangeError);
 go(legacy,'exitEvac');assert.equal(Story.interact(legacy).ok,true);
 assert.equal(Story.debrief(legacy).civilianVehicleArrived,false);
 assert.match(Story.debrief(legacy).summary,/차량 도착은 확인되지 않았/);
});
