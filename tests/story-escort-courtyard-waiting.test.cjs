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

test('courtyard E resumes nearby waiting guide; next 60Hz step verifies true arrival',()=>{
  const state=waitingEscort();
  const before={x:state.guide.x,z:state.guide.z};
  Story.step(state,1/60,{});
  assert.equal(state.guide.arrived,false,'explicit hold remains until local E press');
  const action=Story.interact(state);
  assert.equal(action.ok,true);
  assert.equal(action.event,'guide_resume_at_exit');
  assert.equal(state.guide.waiting,false);
  assert.equal(state.guide.arrived,false,'keypress itself must not grant completion');
  assert.deepEqual([state.guide.x,state.guide.z],[before.x,before.z]);
  Story.step(state,1/60,{});
  assert.equal(state.guide.arrived,true);
  assert.match(state.message,/안뜰 도착/);
  const persisted=Story.serialize(state);
  const resumed=Story.restore(persisted);
  assert.equal(resumed.guide.arrived,true);
  assert.equal(resumed.guide.waiting,false);
  assert.equal(Story.nearest(resumed)?.id,'exitEvac');
  assert.equal(Story.interact(resumed).ok,true);
  assert.equal(resumed.phase,'complete');
  assert.equal(resumed.world.status,'won');
});

test('waiting guide far from courtyard never resumes or completes remotely',()=>{
  const state=waitingEscort(0,-61,-10.5,-55);
  const before={...state.guide};
  Story.step(state,1/60,{});
  assert.deepEqual(state.guide,before);
  assert.equal(Story.nearest(state)?.id,'exitEvac');
  const result=Story.interact(state);
  assert.equal(result.ok,false);
  assert.equal(result.reason,'guide_not_arrived');
  assert.equal(state.guide.waiting,true);
  assert.equal(state.phase,'exit');
  assert.equal(Story.restore(Story.serialize(state)).guide.waiting,true);
});

test('no E interaction with courtyard guide outside direct local reach',()=>{
  const state=waitingEscort(3.8,-61,0,-61);
  assert.equal(Story.nearest(state)?.id,'exitEvac');
  assert.equal(Story.interact(state).reason,'guide_not_arrived');
  assert.equal(state.guide.waiting,true);
  assert.equal(state.guide.arrived,false);
});

test('courtyard E does not resume escort through a solid intervening wall',()=>{
  const state=waitingEscort(2.5,-61,0,-61);
  state.world.obstacles.push({x:1.25,z:-61,w:.6,d:4,type:'story-container'});
  assert.notEqual(Story.interact(state).event,'guide_resume_at_exit');
  assert.equal(state.guide.waiting,true);
  assert.equal(state.guide.arrived,false);
});

test('paused and nonfinite simulation frames never grant arrival after local resume',()=>{
  const state=waitingEscort();
  assert.equal(Story.interact(state).event,'guide_resume_at_exit');
  for(const dt of [0,-1,NaN,Infinity])Story.step(state,dt,{});
  assert.equal(state.guide.arrived,false);
  assert.equal(state.world.elapsed,0);
  Story.step(state,1/60,{});
  assert.equal(state.guide.arrived,true);
});
