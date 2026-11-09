'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Story=require('../src/story-slice.js');
const Comms=require('../src/story-comms.js');
const at=(s,p)=>{s.world.player.x=p.x;s.world.player.z=p.z;};
function onStreet(){
 const s=Story.createState();
 at(s,Story.POINTS.terminal);
 assert.equal(Story.interact(s).phase,'engagement');
 for(const b of s.world.bots){b.alive=false;b.health=0;}
 s.combat.cleared=true;s.phase='records';
 return s;
}
test('existing F interaction actually offers both staffed routes without collecting original deployment papers',()=>{
 for(const [pointId,expected,kind] of [
  ['coordinatorRequest','유수프 구조단','south'],
  ['eastLocalRequest','동쪽 현지 통로 담당자','east']
 ]){
  const s=onStreet();
  assert.deepEqual(s.found,[]);
  at(s,Story.POINTS[pointId]);
  const offer=Story.localRouteOffer(s);
  assert.ok(offer,'offer derived from genuine nearest reachable F-key target');
  assert.equal(offer.kind,kind);
  assert.equal(offer.speaker,expected);
  assert.match(Story.objective(s),/F키/);
  assert.match(Story.objective(s),/서류는 필요하지 않습니다|진행할 수 있습니다/);
  const result=Story.interact(s);
  assert.equal(result.ok,true);
  assert.equal(s.choice,kind==='south'?'evacuation':'verification');
  assert.equal(s.phase,'exit');
  assert.deepEqual(s.found,[]);
  assert.equal(Story.localRouteOffer(s),null,'a route cannot be selected twice');
  const saved=Story.serialize(s);
  assert.equal(Story.serialize(Story.restore(saved)),saved);
 }
});
test('distant, hidden, or earlier-phase humans never become magical HUD offers',()=>{
 const s=onStreet();
 at(s,{x:0,z:-40});
 assert.equal(Story.localRouteOffer(s),null);
 assert.match(Story.objective(s),/기록 조사는 선택 사항/);
 const staff=Story.POINTS.eastLocalRequest;
 at(s,staff);
 assert.equal(Story.localRouteOffer(s)?.kind,'east');
 // A solid physical wall between player and staff removes the local E
 // interaction as well as the onscreen offer.
 const player={x:staff.x,z:staff.z+3};
 at(s,player);
 s.world.obstacles.push({x:staff.x,z:staff.z+1.5,w:3,d:.9,type:'test-wall'});
 assert.equal(Story.localRouteOffer(s),null);
 s.world.obstacles.pop();
 const prior=Story.createState();
 at(prior,staff);
 assert.equal(Story.localRouteOffer(prior),null,'briefing before escalation does not spawn a fake route request');
});
test('character comms reacts to physical east door obstruction and never mandates records',()=>{
 const s=onStreet();
 assert.match(Comms.briefing(s).message,/기록 비교는 선택 사항/);
 assert.doesNotMatch(Comms.briefing(s).message,/기록 확인은 동쪽 경로를 선택할 때 필요한/);
 at(s,Story.POINTS.eastLocalRequest);
 assert.equal(Story.interact(s).ok,true);
 assert.equal(s.phase,'exit');
 s.gateObstructed=true;
 const blocked=Comms.briefing(s);
 assert.equal(blocked.speaker,'조현지');
 assert.match(blocked.message,/멈췄습니다/);
 assert.match(blocked.message,/완료로 판단할 수 없습니다/);
 s.gateObstructed=false;
 assert.notEqual(Comms.briefing(s).message,blocked.message);
});
