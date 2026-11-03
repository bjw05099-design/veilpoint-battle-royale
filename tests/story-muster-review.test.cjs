'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Story=require('../src/story-slice.js');
const go=(s,id)=>{s.world.player.x=Story.POINTS[id].x;s.world.player.z=Story.POINTS[id].z;};
function cleared(){
  const s=Story.createState();go(s,'terminal');assert.equal(Story.interact(s).ok,true);
  for(const b of s.world.bots)for(let i=0;i<2;i++){
    s.world.player.yaw=Math.atan2(b.x-s.world.player.x,-(b.z-s.world.player.z));
    s.world.player.pitch=0;s.world.elapsed+=.21;
    assert.equal(Story.fire(s).hit,true);
  }
  assert.equal(s.phase,'records');
  go(s,'decision');assert.equal(Story.interact(s).ok,true);
  assert.equal(Story.choose(s,'evacuation').ok,true);
  return s;
}
test('optional south muster review is physical, persists, and changes the CH01 outcome',()=>{
  const s=cleared();
  assert.equal(Story.markers(s).some(p=>p.id==='muster'),true);
  assert.match(Story.objective(s),/인원 확인표/);
  assert.equal(Story.interact(s).ok,false,'remote action must not confirm the review');
  go(s,'muster');
  assert.equal(Story.nearest(s).id,'muster');
  assert.deepEqual(Story.interact(s),{ok:true,event:'muster',phase:'exit'});
  assert.equal(s.musterConfirmed,true);
  assert.equal(Story.markers(s).some(p=>p.id==='muster'),false);
  assert.match(Story.situation(s).civilianConsequence,/대조 완료/);
  const saved=Story.serialize(s),restored=Story.restore(saved);
  assert.equal(Story.serialize(restored),saved,'checkpoint must replay identically');
  const a=Story.restore(saved),b=Story.restore(saved);
  for(let i=0;i<120;i++){Story.step(a,1/60,{});Story.step(b,1/60,{});}
  assert.equal(Story.serialize(a),Story.serialize(b),'60Hz mission state must be deterministic');
  go(restored,'exitEvac');
  assert.equal(Story.interact(restored).ok,true);
  assert.equal(Story.debrief(restored).musterConfirmed,true);
  assert.equal(Story.debrief(restored).civilianOutcome,'south-headcount-verified');
});
test('evacuation remains completable without optional review; legacy saves default off',()=>{
  const s=cleared();const old=JSON.parse(Story.serialize(s));delete old.musterConfirmed;
  const restored=Story.restore(JSON.stringify(old));
  assert.equal(restored.musterConfirmed,false);
  go(restored,'exitEvac');assert.equal(Story.interact(restored).ok,true);
  assert.equal(Story.debrief(restored).civilianOutcome,'south-evacuation-prioritized');
});
test('forged muster confirmation is rejected before route selection or on east route',()=>{
  const early=JSON.parse(Story.serialize(Story.createState()));
  early.musterConfirmed=true;
  assert.throws(()=>Story.restore(JSON.stringify(early)),RangeError);
  const east=cleared();
  east.phase='decision';east.choice=null;
  assert.equal(Story.choose(east,'verification').ok,false,'verification needs records');
  const bad=JSON.parse(Story.serialize(cleared()));
  bad.choice='verification';bad.musterConfirmed=true;
  assert.throws(()=>Story.restore(JSON.stringify(bad)),RangeError);
  bad.musterConfirmed='yes';
  assert.throws(()=>Story.restore(JSON.stringify(bad)),RangeError);
});
