'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Story=require('../src/story-slice.js');

function beginEncounter() {
  const state=Story.createState();
  const p=state.world.player;
  p.x=1.3;p.z=-18.7; // Non-grid position distinguishes sight from rounded sound.
  assert.equal(Story.interact(state).ok,true);
  assert.equal(state.phase,'engagement');
  return state;
}
function fireAtFirstHostile(state) {
  const p=state.world.player,hostile=state.world.bots[0];
  p.yaw=Math.atan2(hostile.x-p.x,-(hostile.z-p.z));
  const result=Story.fire(state);
  assert.equal(result.ok,true);
  return hostile;
}

test('CH01 visible gunfire retains exact player evidence and survives checkpoint restore',()=>{
  const state=beginEncounter(),p=state.world.player;
  const hostile=fireAtFirstHostile(state);
  assert.equal(hostile.alive,true);
  assert.equal(hostile.lastSeenX,p.x);
  assert.equal(hostile.lastSeenZ,p.z);
  assert.equal(hostile.investigateUntil,state.world.elapsed+3);
  const resumed=Story.restore(Story.serialize(state));
  assert.equal(resumed.world.bots[0].lastSeenX,p.x);
  assert.equal(resumed.world.bots[0].lastSeenZ,p.z);
  assert.equal(resumed.world.bots[0].investigateUntil,hostile.investigateUntil);
});

test('CH01 gunfire behind an observer retains only coarse audible evidence',()=>{
  const state=beginEncounter(),p=state.world.player;
  state.world.bots[0].angle=0; // Facing away from the captain.
  const hostile=fireAtFirstHostile(state);
  assert.equal(hostile.lastSeenX,Math.round(p.x/2)*2);
  assert.equal(hostile.lastSeenZ,Math.round(p.z/2)*2);
  assert.notEqual(hostile.lastSeenX,p.x);
});

test('CH01 solid cover prevents exact visual localization after an audible shot',()=>{
  const state=beginEncounter(),p=state.world.player;
  state.world.obstacles.push({x:0,z:-24,w:5,d:1,h:2,type:'cover'});
  const hostile=fireAtFirstHostile(state);
  assert.equal(hostile.lastSeenX,Math.round(p.x/2)*2);
  assert.equal(hostile.lastSeenZ,Math.round(p.z/2)*2);
});

test('CH01 sight evidence remains deterministic under 60Hz replay',()=>{
  const a=beginEncounter(),b=beginEncounter();
  fireAtFirstHostile(a);fireAtFirstHostile(b);
  for(let tick=0;tick<120;tick++){
    Story.step(a,1/60,{crouch:true});
    Story.step(b,1/60,{crouch:true});
  }
  assert.equal(Story.serialize(a),Story.serialize(b));
});
