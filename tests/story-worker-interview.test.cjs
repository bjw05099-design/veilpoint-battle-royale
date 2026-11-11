'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Story=require('../src/story-slice.js');
const Comms=require('../src/story-comms.js');
const Sim=require('../src/simulation.js');

function reachedRecords(){
 const s=Story.createState();
 s.world.player.x=Story.POINTS.terminal.x;
 s.world.player.z=Story.POINTS.terminal.z;
 assert.equal(Story.interact(s).ok,true);
 // Match the physical post-encounter world; this test targets civilian
 // interaction only, not combat mechanics.
 for(const b of s.world.bots){b.health=0;b.alive=false;}
 s.combat.cleared=true;s.phase='records';
 return s;
}
test('CH01 worker interview requires approaching a moving witness on foot',()=>{
 const s=reachedRecords();
 assert.equal(Story.markers(s).some(m=>m.id==='harborWorker'),false);
 assert.equal(s.workerInterviewed,false);
 s.world.player.x=18;s.world.player.z=-9;
 const marker=Story.markers(s).find(m=>m.id==='harborWorker');
 assert.ok(marker,'witness must be physically nearby and unobstructed');
 assert.equal(marker.x,s.worker.x);
 Story.step(s,1/60,{});
 assert.ok(s.worker.x>20,'worker keeps physically walking');
 assert.equal(Story.nearest(s).id,'harborWorker');
 const live=s.world.loot.find(m=>m.markerId==='harborWorker');
 assert.equal(live.x,s.worker.x,'visible marker tracks the actual 60Hz actor pose');
 const answer=Story.interact(s);
 assert.deepEqual(answer,{ok:true,event:'harbor_worker_interview',phase:'records'});
 assert.equal(s.workerInterviewed,true);
 assert.equal(Story.markers(s).some(m=>m.id==='harborWorker'),false);
 assert.match(s.subtitle,/정확한 시간/);
 assert.equal(Story.interact(s).ok,false,'conversation is not infinitely repeatable');
});
test('blocked or distant worker cannot be questioned with a remote E action',()=>{
 const s=reachedRecords(),p=s.world.player;
 p.x=18;p.z=-9;
 s.world.obstacles.push({x:20,z:-10.5,w:5,d:.5,h:1.7});
 assert.equal(Story.markers(s).some(m=>m.id==='harborWorker'),false);
 assert.notEqual(Story.nearest(s)?.id,'harborWorker');
 assert.equal(Story.interact(s).ok,false);
 assert.equal(s.workerInterviewed,false);
});
test('witness statement persists in existing v2 saves without promoting it to verified timestamps',()=>{
 const s=reachedRecords();
 s.world.player.x=18;s.world.player.z=-9;
 assert.equal(Story.interact(s).event,'harbor_worker_interview');
 s.found=['recordA','recordB'];
 const archived=Comms.briefing(s);
 assert.equal(archived.speaker,'이수혁 대위',
  'the captain remembers a direct local interview rather than a remote voice');
 assert.match(archived.message,/그 개인의 진술/);
 assert.match(archived.message,/시각은 미확인/);
 const raw=Story.serialize(s),restored=Story.restore(raw);
 assert.equal(restored.workerInterviewed,true);
 assert.equal(Story.serialize(restored),raw);
 const old=JSON.parse(raw);delete old.workerInterviewed;
 assert.equal(Story.restore(JSON.stringify(old)).workerInterviewed,false,'older CH01 saves remain readable');
 const invalid=JSON.parse(raw);invalid.workerInterviewed='true';
 assert.throws(()=>Story.restore(JSON.stringify(invalid)),/checkpoint/i);
 invalid.workerInterviewed=true;invalid.worker=null;
 assert.throws(()=>Story.restore(JSON.stringify(invalid)),/checkpoint/i);
 restored.phase='decision';
 assert.equal(Story.choose(restored,'evacuation').ok,true);
 restored.world.player.x=Story.POINTS.exitEvac.x;
 restored.world.player.z=Story.POINTS.exitEvac.z;
 assert.equal(Story.interact(restored).ok,true);
 assert.equal(restored.phase,'complete');
 const report=Story.debrief(restored);
 assert.equal(report.workerInterviewed,true);
 assert.match(report.summary,/시간 미확인 진술/);
});
