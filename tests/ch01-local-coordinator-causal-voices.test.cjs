'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Story=require('../src/story-slice.js');
function setup(){
 const s=Story.createState();
 // This is a story consequence fixture after the previously authored
 // disruption. It tests only civilian decisions and their known outcomes.
 s.phase='records';s.combat.started=true;s.combat.cleared=true;
 return s;
}
function talk(s){
 s.world.player.x=Story.POINTS.coordinatorRequest.x;
 s.world.player.z=Story.POINTS.coordinatorRequest.z;
 assert.equal(Story.nearest(s)?.id,'coordinatorRequest');
 const result=Story.interact(s);
 assert.equal(result.ok,true);
 assert.equal(s.choice,'evacuation');
 assert.equal(s.phase,'exit');
 assert.deepEqual(s.found,[],'no historical paperwork collection is mandatory');
 assert.equal(s.guide.active,false,'speaking to the local actor does not teleport a helper');
 assert.equal(s.transportVan,null,'speaking does not magically dispatch transport');
 assert.match(s.subtitle,/2019년 리야드 합의/);
 assert.match(s.subtitle,/합의가 곧 통행 허가는 아니야/);
 assert.match(s.subtitle,/이동 판단은 여러분과 함께 확인하겠습니다/);
 return s;
}
test('Yusuf explicitly distinguishes a resident choosing a route from actually arriving',()=>{
 const s=setup();
 s.civilianRerouted=true;
 talk(s);
 assert.match(s.subtitle,/도착 전에는 안전하다고 적지 마/);
 assert.match(s.message,/주민의 이동 선택만 확인/);
 assert.doesNotMatch(s.subtitle,/걸어온 주민 한 명은 봤어/);
});
test('Yusuf acknowledges exactly one civilian who truly walked the full public path',()=>{
 const s=setup();
 s.world.player.x=30;s.world.player.z=-60;
 for(let i=0;i<850&&!s.civilianWalker.arrived;i++)Story.step(s,1/60,{});
 assert.equal(s.civilianWalker.arrived,true,'actual 60Hz character travel precedes dialogue');
 talk(s);
 assert.match(s.subtitle,/걸어온 주민 한 명은 봤어/);
 assert.match(s.subtitle,/나머지 사람들은 아직 확인 중/);
 assert.match(s.message,/주민 한 명의 현장 도착 확인/);
 assert.doesNotMatch(s.message,/전원 안전|모두 대피/);
});
test('unrestored communications must not be presented as verified public service',()=>{
 const s=setup();
 talk(s);
 assert.match(s.subtitle,/통신이 닿지 않는 동안/);
 assert.doesNotMatch(s.subtitle,/복구한 비상 회선/);
 const another=setup();
 another.relayRestored=true;
 talk(another);
 assert.match(another.subtitle,/복구한 비상 회선은 도움이 돼/);
 assert.match(another.subtitle,/다른 골목을 열어 주지는 않아/);
});
test('historical family memory belongs only to a worker the captain actually met',()=>{
 const anonymous=setup();
 talk(anonymous);
 assert.doesNotMatch(anonymous.subtitle,/1990년과 1994년/);
 const met=setup();
 met.world.player.x=met.worker.x;met.world.player.z=met.worker.z;
 assert.equal(Story.nearest(met)?.id,'harborWorker');
 assert.equal(Story.interact(met).event,'harbor_worker_interview');
 assert.equal(met.workerInterviewed,true);
 talk(met);
 assert.match(met.subtitle,/1990년과 1994년을 한 가족 안에서도 다르게 기억/);
 assert.match(met.subtitle,/한 사람의 말로 이 도시 전체를 판단하지 않겠습니다/);
});
test('actual Korean briefing and fixed checkpoint v2 remain unchanged after narrative enhancement',()=>{
 const fresh=Story.createState(),raw=Story.serialize(fresh);
 assert.equal(Story.serialize(Story.restore(raw)),raw);
 assert.equal(fresh.deploymentReviewed,false);
 assert.match(Story.openingBeat(fresh).location,/대한민국/);
});
