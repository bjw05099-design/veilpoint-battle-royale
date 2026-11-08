'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Story=require('../src/story-slice.js');
test('after the unexpected conflict, a harbor worker decides to clear the walkway without an E interview',()=>{
 const s=Story.createState();
 s.phase='records';s.combat.cleared=true;s.world.bots=[];
 assert.equal(s.workerInterviewed,false);
 const before={...s.worker};
 for(let t=0;t<850;t++)Story.step(s,1/60,{});
 assert.ok(s.worker.x>before.x,'worker actually traversed sidewalk');
 assert.ok(s.worker.z>before.z,'worker walked out of the exposed lane independently');
 assert.ok(s.worker.z<=-8+1e-8);
 assert.equal(s.workerInterviewed,false,'the player never ordered or interviewed the worker');
 assert.equal(Story.serialize(Story.restore(Story.serialize(s))),Story.serialize(s),
   'v2 worker location remains a checkpoint-compatible physical state');
 s.phase='complete';
 const report=Story.debrief(s);
 assert.equal(report.harborWorkerReachedShelter,true);
 assert.equal(report.workerInterviewed,false);
 assert.ok(report.closingScene.lines.at(-1).includes('항구 작업자는 별도의 지시 없이'));
});
test('older CH01 checkpoints with an uninterviewed worker standing at original lane still load',()=>{
 const s=Story.createState();
 s.phase='records';s.combat.cleared=true;
 const saved=Story.serialize(s),reloaded=Story.restore(saved);
 assert.equal(reloaded.workerInterviewed,false);
 assert.deepEqual(reloaded.worker,s.worker);
 assert.equal(Story.serialize(reloaded),saved);
});
test('a witness who already reached the sheltered street does not promise to walk there again',()=>{
 const s=Story.createState();
 s.phase='records';s.combat.cleared=true;s.world.bots=[];
 for(let i=0;i<850;i++)Story.step(s,1/60,{});
 s.world.player.x=s.worker.x-2;s.world.player.z=s.worker.z;
 const interaction=Story.interact(s);
 if(interaction.ok&&interaction.event==='harborWorker'){
  assert.match(s.subtitle,/이미 이동했습니다/);
  assert.equal(s.workerInterviewed,true);
 }
});
