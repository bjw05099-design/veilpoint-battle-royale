'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Story=require('../src/story-slice.js');
const go=(s,x,z)=>{s.world.player.x=x;s.world.player.z=z;};
function route(choice){
 const s=Story.createState();
 // Real CH01 event state, then the test starts at the existing cleared
 // encounter. Preserve all three authored actor records for v2 save validation.
 go(s,Story.POINTS.terminal.x,Story.POINTS.terminal.z);
 assert.equal(Story.interact(s).ok,true);
 for(const actor of s.world.bots){actor.health=0;actor.alive=false;}
 s.combat.cleared=true;s.phase='decision';
 assert.equal(Story.choose(s,choice).ok,true);
 return s;
}
test('south corridor spoken report never claims a civilian journey that did not occur',()=>{
 const s=route('evacuation');
 go(s,0,-54);
 Story.step(s,1/60,{});
 assert.equal(s.passageWarningHeard,true);
 assert.match(s.subtitle,/출국 전에 들은 복귀 일정/);
 assert.doesNotMatch(s.subtitle,/차량은 승차 지점에 도착/);
 assert.doesNotMatch(s.subtitle,/주민 한 명은 걸어서 도착/);
 const checkpoint=Story.serialize(s);
 assert.equal(Story.serialize(Story.restore(checkpoint)),checkpoint);
});
test('south corridor gives a causally grounded local update after both pedestrian and vehicle physically arrive',()=>{
 const s=route('evacuation');
 go(s,10,-54);
 assert.equal(Story.interact(s).ok,true,'driver starts walking to the parked vehicle');
 go(s,0,-38);
 for(let i=0;i<2100&&(!s.transportVan.arrived||!s.civilianWalker.arrived);i++)
  Story.step(s,1/60,{});
 assert.equal(s.transportVan.arrived,true);
 assert.equal(s.civilianWalker.arrived,true);
 assert.equal(s.passageWarningHeard,false);
 go(s,0,-54);Story.step(s,1/60,{});
 assert.equal(s.passageWarningHeard,true);
 assert.match(s.subtitle,/차량은 승차 지점에 도착/);
 assert.match(s.subtitle,/주민 한 명은 걸어서 도착/);
 assert.match(s.subtitle,/다른 주민은 아직 미확인/);
 assert.doesNotMatch(s.subtitle,/철수 완료|주민 수송을 완료/);
 const restored=Story.restore(Story.serialize(s));
 assert.equal(restored.passageWarningHeard,true);
 assert.equal(restored.transportVan.arrived,true);
 assert.equal(restored.civilianWalker.arrived,true);
});
test('east corridor distinguishes actual radio repair from mere gate authorization without requiring documents',()=>{
 for(const restored of [false,true]){
  const s=route('verification');
  s.relayRestored=restored;
  go(s,27,-53);
  Story.step(s,1/60,{});
  assert.equal(s.passageWarningHeard,true);
  assert.match(s.subtitle,/동쪽 통로에 도착했습니다/);
  assert.match(s.subtitle,/출국 전 귀환 계획/);
  assert.match(s.subtitle,restored?/비상 통신은 복구됐지만/:/현장 통신은 아직 안정적으로 복구되지 않았으며/);
  assert.doesNotMatch(s.subtitle,/출국 전에 받은 파견 지시서를 현지에서 찾아/);
  assert.equal(s.found.length,0,'no documentary prerequisite added');
  assert.equal(Story.serialize(Story.restore(Story.serialize(s))),Story.serialize(s));
 }
});
