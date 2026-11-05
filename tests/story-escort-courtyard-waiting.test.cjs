'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Story=require('../src/story-slice.js');

function waitingEscort(playerX=2.5,playerZ=-61,guideX=0,guideZ=-61){
  const state=Story.createState();
  state.phase='exit';state.choice='evacuation';state.musterConfirmed=true;
  state.guide={active:true,arrived:false,released:false,waiting:true,x:guideX,z:guideZ};
  state.world.player.x=playerX;state.world.player.z=playerZ;
  state.combat.started=true;state.combat.cleared=true;
  state.world.bots=[{id:0,x:0,z:-28,angle:Math.PI,health:0,alive:false,shots:12},
    {id:1,x:15,z:-34,angle:Math.PI,health:0,alive:false,shots:12},
    {id:2,x:-15,z:-34,angle:Math.PI,health:0,alive:false,shots:12}];
  return state;
}

test('waiting escort at physical courtyard completes after a 60Hz step',()=>{
  const state=waitingEscort();
  const before={x:state.guide.x,z:state.guide.z};
  Story.step(state,1/60,{});
  assert.deepEqual([state.guide.x,state.guide.z],[before.x,before.z]);
  assert.equal(state.guide.arrived,true);
  assert.equal(state.guide.waiting,false);
  assert.match(state.message,/안뜰 도착/);
  assert.equal(state.world.status,'playing');
  const persisted=Story.serialize(state);
  const resumed=Story.restore(persisted);
  assert.equal(resumed.guide.arrived,true);
  assert.equal(resumed.guide.waiting,false);
  assert.equal(Story.nearest(resumed)?.id,'exitEvac');
  assert.equal(Story.interact(resumed).ok,true);
  assert.equal(resumed.phase,'complete');
  assert.equal(resumed.world.status,'won');
});

test('waiting guide outside courtyard does not teleport, move or certify arrival',()=>{
  const state=waitingEscort(0,-61,-10.5,-55);
  const old={...state.guide};
  Story.step(state,1/60,{});
  assert.deepEqual(state.guide,old);
  assert.equal(Story.nearest(state)?.id,'exitEvac');
  const result=Story.interact(state);
  assert.equal(result.ok,false);
  assert.equal(result.reason,'guide_not_arrived');
  assert.equal(state.phase,'exit');
  assert.equal(Story.restore(Story.serialize(state)).guide.waiting,true);
});

test('courtyard guide alone is not an arrival until captain is there too',()=>{
  const state=waitingEscort(-10.5,-55,0,-61);
  Story.step(state,1/60,{});
  assert.equal(state.guide.waiting,true);
  assert.equal(state.guide.arrived,false);
});

test('zero and invalid time steps never certify a waiting escort arrival',()=>{
  const state=waitingEscort();
  for(const dt of [0,-1,NaN,Infinity])Story.step(state,dt,{});
  assert.equal(state.guide.arrived,false);
  assert.equal(state.guide.waiting,true);
  assert.equal(state.world.elapsed,0);
});
