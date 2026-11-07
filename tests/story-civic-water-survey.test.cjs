'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Story=require('../src/story-slice.js'),Sim=require('../src/simulation.js');
function cleared(){
 const s=Story.createState(),p=s.world.player;
 p.x=Story.POINTS.terminal.x;p.z=Story.POINTS.terminal.z;
 assert.equal(Story.interact(s).ok,true);
 for(const b of s.world.bots){b.health=0;b.alive=false;}
 s.combat.cleared=true;s.phase='records';return s;
}
test('CH01 water survey is a multi-location physical city mission, not a remote checklist',()=>{
 const s=cleared(),p=s.world.player;
 assert.equal(s.civicVisited,false);
 assert.equal(Story.markers(s).some(m=>m.id==='waterSite'),false,
  'unexplored far block must not appear before reaching public civic courtyard');
 p.x=77;p.z=122;
 Story.step(s,1/60,{});
 assert.equal(s.civicVisited,true);
 assert.ok(Story.markers(s).some(m=>m.id==='waterSite'));
 assert.equal(Story.interact(s).reason,'too_far');
 p.x=105;p.z=109;
 for(let frame=0;frame<600;frame++){
  const q=Story.POINTS.waterSite,range=Math.hypot(q.x-p.x,q.z-p.z);
  if(range<1.0)break;
  p.yaw=Math.atan2(q.x-p.x,-(q.z-p.z));
  Story.step(s,1/60,{forward:true});
 }
 assert.ok(Math.hypot(p.x-Story.POINTS.waterSite.x,
                       p.z-Story.POINTS.waterSite.z)<1.8,
  'the captain must actually walk through the open west arcade entrance');
 assert.equal(Sim.blocked(p.x,p.z,.85,s.world.obstacles),false);
 assert.equal(Story.nearest(s)?.id,'waterSite');
 assert.deepEqual(Story.interact(s),{ok:true,event:'water_surveyed',phase:'records'});
 assert.equal(s.waterSurveyed,true);
 assert.equal(s.waterReportFiled,false);
 assert.match(s.subtitle,/단수 원인과 복구 시점은 현장에서 알 수 없습니다/);
 assert.equal(Story.markers(s).some(m=>m.id==='waterSite'),false);
 assert.equal(Story.markers(s).some(m=>m.id==='waterReportDesk'),true);
 assert.equal(Story.interact(s).reason,'too_far',
  'cannot remotely file information from the other side of the city');
 p.x=Story.POINTS.waterReportDesk.x;p.z=Story.POINTS.waterReportDesk.z;
 assert.equal(Story.nearest(s)?.id,'waterReportDesk');
 assert.deepEqual(Story.interact(s),{ok:true,event:'water_report_filed',phase:'records'});
 assert.equal(s.waterReportFiled,true);
 assert.equal(Story.markers(s).some(m=>m.id==='waterReportDesk'),false);
 assert.match(s.subtitle,/확인되지 않은 복구 일정을 주민에게 안내하지/);
});
test('CH01 water survey and staff handoff are strictly saved without invalid story claims',()=>{
 const s=cleared(),p=s.world.player;
 p.x=77;p.z=123;Story.step(s,1/60,{});
 p.x=Story.POINTS.waterSite.x;p.z=Story.POINTS.waterSite.z;
 assert.equal(Story.interact(s).event,'water_surveyed');
 const stage=Story.serialize(s),stageRestored=Story.restore(stage);
 assert.equal(stageRestored.waterSurveyed,true);
 assert.equal(stageRestored.waterReportFiled,false);
 assert.equal(Story.serialize(stageRestored),stage);
 p.x=Story.POINTS.waterReportDesk.x;p.z=Story.POINTS.waterReportDesk.z;
 assert.equal(Story.interact(s).event,'water_report_filed');
 const done=Story.serialize(s);
 assert.equal(Story.restore(done).waterReportFiled,true);
 assert.equal(Story.serialize(Story.restore(done)),done);
 const old=JSON.parse(done);
 delete old.waterSurveyed;delete old.waterReportFiled;
 const previous=Story.restore(JSON.stringify(old));
 assert.equal(previous.waterSurveyed,false);
 assert.equal(previous.waterReportFiled,false);
 for(const invalid of ['true',1,null]){
  assert.throws(()=>Story.restore(JSON.stringify({...old,waterSurveyed:invalid})),
   /checkpoint/i);
  assert.throws(()=>Story.restore(JSON.stringify({...old,waterReportFiled:invalid})),
   /checkpoint/i);
 }
 assert.throws(()=>Story.restore(JSON.stringify({...old,waterSurveyed:false,waterReportFiled:true})),
  /checkpoint/i,'a filed report requires a verified actual survey');
 assert.throws(()=>Story.restore(JSON.stringify({...old,civicVisited:false,waterSurveyed:true,waterReportFiled:false})),
  /checkpoint/i,'a claimed distant survey requires a city visit');
 p.x=Story.POINTS.decision.x;p.z=Story.POINTS.decision.z;
 assert.equal(Story.interact(s).phase,'decision');
 assert.equal(Story.choose(s,'evacuation').ok,true);
 p.x=Story.POINTS.exitEvac.x;p.z=Story.POINTS.exitEvac.z;
 assert.equal(Story.interact(s).phase,'complete');
 const result=Story.debrief(s);
 assert.equal(result.waterSurveyed,true);
 assert.equal(result.waterReportFiled,true);
 assert.match(result.summary,/급수대 상태를 직접 확인/);
 assert.match(result.summary,/복구 완료 여부는 미확인/);
});
