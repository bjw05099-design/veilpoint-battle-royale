'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Story=require('../src/story-slice.js');
const Journal=require('../src/field-journal.js');
const go=(s,id)=>{s.world.player.x=Story.POINTS[id].x;s.world.player.z=Story.POINTS[id].z;};
function southRoute(){
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
test('south shelter intake sheet is a distinct physical, optional story interaction',()=>{
 const state=southRoute();
 assert.equal(state.dispatchReviewed,false);
 assert.equal(Story.markers(state).some(m=>m.id==='dispatchLedger'),true);
 assert.equal(Journal.entries(state).some(x=>x.id==='dispatch'),false);
 const before=Story.serialize(state);
 assert.equal(Story.interact(state).ok,false,'a distant E press cannot inspect the ledger');
 assert.equal(Story.serialize(state),before);
 go(state,'dispatchLedger');
 assert.equal(Story.nearest(state).id,'dispatchLedger');
 const event=Story.interact(state);
 assert.equal(event.ok,true);
 assert.equal(state.dispatchReviewed,true);
 assert.equal(Story.markers(state).some(m=>m.id==='dispatchLedger'),false,
  'a signed intake sheet cannot be collected twice');
 assert.match(state.subtitle,/접수 장부/);
 assert.match(Journal.entries(state).find(x=>x.id==='dispatch').detail,/인수 서명란/);
 const saved=Story.serialize(state),restored=Story.restore(saved);
 assert.equal(restored.dispatchReviewed,true);
 assert.equal(Story.serialize(restored),saved);
 go(restored,'exitEvac');
 assert.equal(Story.interact(restored).ok,true);
 assert.match(Journal.entries(restored).find(x=>x.id==='debrief').detail,/접수 장부 현장 열람 완료/);
});
test('ledger never becomes mandatory or grants invented completion to other story paths',()=>{
 const state=southRoute(),serialized=JSON.parse(Story.serialize(state));
 assert.equal(serialized.dispatchReviewed,false);
 delete serialized.dispatchReviewed;
 const legacy=Story.restore(JSON.stringify(serialized));
 assert.equal(legacy.dispatchReviewed,false);
 go(legacy,'exitEvac');
 assert.equal(Story.interact(legacy).ok,true);
 assert.match(Journal.entries(legacy).find(x=>x.id==='debrief').detail,/접수 장부 현장 미열람/);
 const forged=JSON.parse(Story.serialize(Story.createState()));
 forged.dispatchReviewed=true;
 assert.throws(()=>Story.restore(JSON.stringify(forged)),RangeError);
 const east=JSON.parse(Story.serialize(southRoute()));
 east.choice='verification';east.dispatchReviewed=true;
 assert.throws(()=>Story.restore(JSON.stringify(east)),RangeError);
});
