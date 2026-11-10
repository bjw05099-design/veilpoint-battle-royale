'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Story=require('../src/story-slice.js');
const Sim=require('../src/simulation.js');
function aftermath(){
 const s=Story.createState();
 const relay=Story.POINTS.terminal;
 s.world.player.x=relay.x;s.world.player.z=relay.z;
 assert.equal(Story.interact(s).phase,'engagement');
 for(const body of s.world.bots){body.alive=false;body.health=0;}
 s.phase='records';s.combat.cleared=true;
 Story.step(s,1/60,{});
 return s;
}
test('CH01 offers one real line-of-sight F conversation with physically present Kim only after witnessed public civilian aftercare',()=>{
 const s=aftermath();
 const person=s.kimJiyoon;
 s.world.player.x=person.x;s.world.player.z=person.z+2.5;
 assert.equal(Story.markers(s).some(p=>p.id==='kimAftercare'),false,
  'combat alone must not fabricate a civilian aftercare success');
 s.workerInterviewed=true;
 assert.equal(Story.markers(s).some(p=>p.id==='kimAftercare'),true);
 const wall={x:person.x,z:person.z+1.25,w:2.4,d:.3,h:3,type:'test-sight-block'};
 s.world.obstacles.push(wall);
 assert.equal(Story.markers(s).some(p=>p.id==='kimAftercare'),false,
  'a solid wall makes the colleague unreachable despite map proximity');
 s.world.obstacles.pop();
 const first=Story.interact(s);
 assert.deepEqual(first,{ok:true,event:'kim_local_aftercare',phase:'records'});
 assert.match(s.subtitle,/김지윤/);
 assert.match(s.subtitle,/직접 진술/);
 assert.match(s.subtitle,/본래 파견 지시/);
 assert.equal(s.kimAftercareReviewed,true);
 assert.equal(Story.markers(s).some(p=>p.id==='kimAftercare'),false,
  'one event should not generate a repeating mission marker');
 assert.notEqual(Story.nearest(s)?.id,'kimAftercare');
 assert.equal(s.world.player.x,person.x,'no player teleport or scene reset');
});
test('optional Kim character beat persists in V2 and completed cause report, yet old checkpoints remain compatible',()=>{
 const s=aftermath();s.workerInterviewed=true;
 s.world.player.x=s.kimJiyoon.x;s.world.player.z=s.kimJiyoon.z+2.4;
 assert.equal(Story.interact(s).event,'kim_local_aftercare');
 const json=Story.serialize(s),copy=Story.restore(json);
 assert.equal(copy.kimAftercareReviewed,true);
 assert.equal(Story.serialize(copy),json);
 copy.phase='complete';copy.choice='evacuation';
 assert.equal(Story.debrief(copy).kimAftercareWitnessed,true);
 assert.match(Story.closingScene(copy).lines.join(' '),/현장에서 직접 확인된/);
 assert.match(Story.closingScene(copy).lines.join(' '),/복귀는 아직/);
 const historic=JSON.parse(json);delete historic.kimAftercareReviewed;
 const earlier=Story.restore(JSON.stringify(historic));
 assert.equal(earlier.kimAftercareReviewed,false);
 const forgery=JSON.parse(json);forgery.workerInterviewed=false;
 assert.throws(()=>Story.restore(JSON.stringify(forgery)),RangeError,
  'aftercare memory without the witnessed civilian premise is invalid');
});
test('Kim follow-up markers track real companion 60Hz movement without revealing hidden people through buildings',()=>{
 const s=aftermath();s.workerInterviewed=true;
 s.world.player.x=s.kimJiyoon.x;s.world.player.z=s.kimJiyoon.z+2.7;
 Story.step(s,1/60,{});
 const viewed=Story.markers(s).find(p=>p.id==='kimAftercare');
 assert.ok(viewed);
 const render=s.world.loot.find(p=>p.markerId==='kimAftercare');
 assert.ok(render);
 assert.equal(render.x,viewed.x);
 assert.equal(render.z,viewed.z);
 s.world.player.x=100;s.world.player.z=100;
 Story.step(s,1/60,{});
 assert.equal(Story.markers(s).some(p=>p.id==='kimAftercare'),false);
 assert.equal(s.world.loot.some(p=>p.markerId==='kimAftercare'),false);
 assert.equal(s.kimAftercareReviewed,false);
});
