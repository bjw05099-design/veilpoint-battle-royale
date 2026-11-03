'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Story=require('../src/story-slice.js');
const go=(s,id)=>{s.world.player.x=Story.POINTS[id].x;s.world.player.z=Story.POINTS[id].z;};
function southRoute(){
  const s=Story.createState();
  go(s,'terminal');assert.equal(Story.interact(s).ok,true);
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
test('CH01 optional civilian relief has physical pickup, weighted movement and direct handoff',()=>{
  const s=southRoute();
  assert.equal(Story.markers(s).some(p=>p.id==='aidPickup'),true);
  assert.equal(Story.markers(s).some(p=>p.id==='aidDrop'),false);
  assert.equal(Story.interact(s).ok,false,'distant pickup cannot be remotely triggered');
  go(s,'aidPickup');
  assert.deepEqual(Story.interact(s),{ok:true,event:'aidPickup',phase:'exit'});
  assert.equal(s.aidPickedUp,true);
  assert.equal(s.world.carryingAid,true);
  assert.equal(Story.markers(s).some(p=>p.id==='aidPickup'),false);
  assert.equal(Story.markers(s).some(p=>p.id==='aidDrop'),true);
  assert.match(Story.objective(s),/운반 중/);
  const unladen=southRoute();
  for(const state of [s,unladen]){
    state.world.player.x=-7;state.world.player.z=-47;state.world.player.yaw=0;
  }
  for(let i=0;i<60;i++){
    Story.step(s,1/60,{forward:true,sprint:true});
    Story.step(unladen,1/60,{forward:true,sprint:true});
  }
  assert.ok(s.world.player.z>unladen.world.player.z,'carrying a crate must slow traversal');
  assert.ok(s.world.player.stamina>unladen.world.player.stamina,'carrying disallows sprint exertion');
  const checkpoint=Story.serialize(s);
  const resumed=Story.restore(checkpoint);
  assert.equal(Story.serialize(resumed),checkpoint);
  assert.equal(resumed.world.carryingAid,true);
  go(resumed,'aidDrop');
  assert.equal(Story.nearest(resumed).id,'aidDrop');
  assert.deepEqual(Story.interact(resumed),{ok:true,event:'aidDrop',phase:'exit'});
  assert.equal(resumed.aidDelivered,true);
  assert.equal(resumed.world.carryingAid,false);
  assert.equal(Story.markers(resumed).some(p=>p.id==='aidDrop'),false);
  assert.match(Story.situation(resumed).aidSupply,/인수 완료/);
  const saved=Story.serialize(resumed),restored=Story.restore(saved);
  assert.equal(Story.serialize(restored),saved);
  go(restored,'exitEvac');
  assert.equal(Story.interact(restored).ok,true);
  const report=Story.debrief(restored);
  assert.equal(report.aidDelivered,true);
  assert.match(report.summary,/비상 물품/);
});
test('60Hz carried-cargo state and handoff are deterministic across checkpoint replay',()=>{
  const s=southRoute();go(s,'aidPickup');Story.interact(s);
  const raw=Story.serialize(s),a=Story.restore(raw),b=Story.restore(raw);
  for(let i=0;i<120;i++){
    const input={forward:i<60,right:i>=60,sprint:true};
    Story.step(a,1/60,input);Story.step(b,1/60,input);
  }
  assert.equal(Story.serialize(a),Story.serialize(b));
  go(a,'aidDrop');go(b,'aidDrop');
  assert.deepEqual(Story.interact(a),Story.interact(b));
  assert.equal(Story.serialize(a),Story.serialize(b));
});
test('CH01 relief is optional and historical checkpoints migrate without extra resources',()=>{
  const s=southRoute(),old=JSON.parse(Story.serialize(s));
  delete old.aidPickedUp;delete old.aidDelivered;
  const migrated=Story.restore(JSON.stringify(old));
  assert.equal(migrated.aidPickedUp,false);
  assert.equal(migrated.aidDelivered,false);
  assert.equal(migrated.world.carryingAid,false);
  go(migrated,'exitEvac');assert.equal(Story.interact(migrated).ok,true);
  assert.equal(Story.debrief(migrated).aidDelivered,false);
  const restarted=Story.createState();
  assert.equal(restarted.aidPickedUp,false);
  assert.equal(restarted.aidDelivered,false);
});
test('forged early, eastern, inconsistent and nonboolean relief saves are rejected',()=>{
  const early=JSON.parse(Story.serialize(Story.createState()));
  early.aidPickedUp=true;
  assert.throws(()=>Story.restore(JSON.stringify(early)),RangeError);
  const s=southRoute(),base=JSON.parse(Story.serialize(s));
  for(const patch of [
    {aidPickedUp:false,aidDelivered:true},
    {aidPickedUp:true,aidDelivered:'true'},
    {aidPickedUp:'true',aidDelivered:false},
    {aidPickedUp:true,aidDelivered:false,choice:'verification'}
  ])assert.throws(()=>Story.restore(JSON.stringify({...base,...patch})),RangeError);
});
test('carried supply has a grounded, visible first-person 3D mesh, not a remote HUD-only token',()=>{
  const fs=require('node:fs');
  const path=require('node:path');
  const renderer=fs.readFileSync(path.resolve(__dirname,'../src/renderer.js'),'utf8');
  assert.match(renderer,/state\.scene==='nahrin'&&state\.carryingAid/);
  assert.match(renderer,/mesh\.box\(p\.x\+Math\.sin\(p\.yaw\)\*\.9/);
});
