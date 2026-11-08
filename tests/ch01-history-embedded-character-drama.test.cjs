'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const Story=require('../src/story-slice.js');
const go=(s,x,z)=>{s.world.player.x=x;s.world.player.z=z;};
function actualAfterEscalation(){
 const s=Story.createState();
 go(s,Story.POINTS.terminal.x,Story.POINTS.terminal.z);
 assert.equal(Story.interact(s).phase,'engagement');
 for(const b of s.world.bots){b.health=0;b.alive=false;}
 s.combat.cleared=true;s.phase='records';
 return s;
}
test('historical memory belongs to a physically heard individual, not omniscient mission intel',()=>{
 const s=actualAfterEscalation();
 assert.equal(s.workerInterviewed,false);
 assert.equal(Story.markers(s).some(m=>m.id==='harborWorker'),false);
 go(s,18,-9);
 assert.equal(Story.nearest(s).id,'harborWorker');
 assert.equal(Story.interact(s).event,'harbor_worker_interview');
 assert.match(s.subtitle,/1990년 통일/);
 assert.match(s.subtitle,/1994년 전쟁/);
 assert.match(s.subtitle,/정확한 시간은 모릅니다/);
 assert.equal(s.workerInterviewed,true);
 assert.equal(Story.markers(s).some(m=>m.id==='harborWorker'),false);
 go(s,Story.POINTS.decision.x,Story.POINTS.decision.z);
 assert.equal(Story.interact(s).ok,true);
 assert.equal(Story.choose(s,'evacuation').ok,true);
 go(s,Story.POINTS.exitEvac.x,Story.POINTS.exitEvac.z);
 assert.equal(Story.interact(s).ok,true);
 const report=Story.debrief(s);
 assert.equal(report.southernFamilyPerspectiveHeard,true);
 assert.match(report.closingScene.lines.at(-1),/그 가족의 말을 도시 전체의 목소리로 적지 않겠습니다/);
 assert.equal(report.campaignUnlocked,false);
 const raw=Story.serialize(s);
 assert.equal(Story.serialize(Story.restore(raw)),raw);
});
test('an unspoken witness is not credited with a political perspective in either exit',()=>{
 const s=actualAfterEscalation();
 s.phase='decision';
 assert.equal(Story.choose(s,'evacuation').ok,true);
 go(s,Story.POINTS.exitEvac.x,Story.POINTS.exitEvac.z);
 assert.equal(Story.interact(s).ok,true);
 const report=Story.debrief(s);
 assert.equal(report.southernFamilyPerspectiveHeard,false);
 assert.doesNotMatch(report.closingScene.lines.at(-1),/가족은 1990년/);
 assert.deepEqual(report.records,[]);
 assert.equal(report.musterConfirmed,false);
});
test('south route authorizes only local actors, not a foreign command or a forced evidence hunt',()=>{
 const s=actualAfterEscalation();
 assert.deepEqual(s.found,[]);
 go(s,-9,-55);
 assert.equal(Story.nearest(s).id,'coordinatorRequest');
 assert.equal(Story.interact(s).ok,true);
 assert.equal(s.choice,'evacuation');
 assert.match(s.subtitle,/2019년 리야드 합의/);
 assert.match(s.subtitle,/합의가 곧 통행 허가는 아니야/);
 assert.deepEqual(s.found,[]);
 assert.equal(s.guide.active,false,'dialogue never teleports or drafts a civilian');
 assert.equal(s.transportVan,null);
 assert.equal(s.gateReadyAt,0);
 const saved=Story.serialize(s);
 assert.equal(Story.serialize(Story.restore(saved)),saved);
});
test('east route refers to separately negotiated 2022 road access without changing real gate authorization',()=>{
 const s=actualAfterEscalation();
 s.phase='decision';
 assert.deepEqual(s.found,[]);
 assert.equal(Story.choose(s,'verification').ok,true);
 assert.match(s.subtitle,/2022년 휴전/);
 assert.match(s.subtitle,/도로 개방은 별도 협의/);
 assert.equal(s.gateLogReviewed,false);
 assert.equal(Story.situation(s).eastGateOpen,false);
 assert.ok(s.gateReadyAt>s.world.elapsed);
 assert.equal(Story.serialize(Story.restore(Story.serialize(s))),Story.serialize(s));
});
test('civilian water concerns and transport testimony follow physical dialogue, not documents or phantom trips',()=>{
 const s=actualAfterEscalation();
 let neighbor=Story.markers(s).find(m=>m.id==='residentRoute');
 assert.equal(neighbor,undefined);
 go(s,s.civilianWalker.x,s.civilianWalker.z);
 neighbor=Story.markers(s).find(m=>m.id==='residentRoute');
 assert.ok(neighbor,'resident must be directly nearby');
 assert.equal(Story.interact(s).event,'resident_route_conversation');
 assert.match(s.subtitle,/급수 펌프/);
 assert.match(s.subtitle,/제가 길을 고르겠습니다/);
 assert.equal(s.civilianRerouted,true);
 assert.equal(s.civilianWalker.arrived,false,'choosing a road is not arriving at the shelter');
 s.phase='decision';assert.equal(Story.choose(s,'evacuation').ok,true);
 go(s,Story.POINTS.transportDriver.x,Story.POINTS.transportDriver.z);
 assert.equal(Story.interact(s).event,'transportDriver');
 assert.match(s.subtitle,/2022년 휴전/);
 assert.match(s.subtitle,/실제 승객 수송은 별도로 확인해야/);
 assert.ok(s.transportVan&&!s.transportVan.arrived);
 const raw=Story.serialize(s),again=Story.restore(raw);
 assert.equal(Story.serialize(again),raw);
 assert.equal(again.transportVan.arrived,false);
});
test('the narrative reference is separated from the physical save protocol and distinguishes historical events from fiction',()=>{
 const guide=fs.readFileSync(path.resolve(__dirname,'../docs/VEILPOINT_STORY_HISTORICAL_DRAMA_KO.md'),'utf8');
 const code=fs.readFileSync(path.resolve(__dirname,'../src/story-slice.js'),'utf8');
 for(const date of ['1990','1994','2011','2014','2015','2019','2022'])
  assert.ok(guide.includes(date),'source chronology missing '+date);
 for(const institute of ['OSESGY','World Bank','UNDP','ICRC'])assert.ok(guide.includes(institute));
 assert.match(guide,/12시간 캠페인 구조/);
 assert.match(guide,/아직 제작되지 않았다/);
 assert.match(guide,/가상 도시/);
 assert.match(guide,/임무.*브리핑/);
 assert.doesNotMatch(code,/const\s+NEW_DEPLOYMENT_ORDERS\s*=/);
 assert.equal(Story.VERSION,2);
 assert.equal(Story.createState().deploymentReviewed,false,
   'the retired legacy deployment paper must not become a story objective again');
});
