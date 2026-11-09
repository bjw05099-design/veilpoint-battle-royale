'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Story=require('../src/story-slice.js');

function civilianScene(){
  const state=Story.createState();
  state.world.player.x=Story.POINTS.terminal.x;
  state.world.player.z=Story.POINTS.terminal.z;
  assert.equal(Story.interact(state).phase,'engagement');
  for(const actor of state.world.bots){actor.alive=false;actor.health=0;}
  state.combat.cleared=true;
  state.phase='records';
  return state;
}

test('CH01 resident walks around a person occupying the public pavement without teleporting',()=>{
  const s=civilianScene();
  s.world.player.x=-2;
  s.world.player.z=-49.0;
  const resident=s.civilianWalker;
  let detoured=false;
  let traveled=0;
  for(let i=0;i<1100&&!resident.arrived;i++){
    const before={x:resident.x,z:resident.z};
    Story.step(s,1/60,{});
    const displacement=Math.hypot(resident.x-before.x,resident.z-before.z);
    assert.ok(displacement<=1.25/60+1e-6,'pedestrian never exceeds their real walking budget');
    assert.ok(Math.hypot(resident.x-s.world.player.x,resident.z-s.world.player.z)>1.25,
      'pedestrian must not pass through the standing captain');
    assert.ok(resident.x>=-4-1e-8&&resident.x<=-2+1e-8,
      'route stays within the authored public footpath');
    if(resident.x<-2.15)detoured=true;
    traveled+=displacement;
  }
  assert.ok(detoured,'standing human forces a physical lateral alternative');
  assert.ok(traveled>10,'the pedestrian has walked a real distance');
  assert.equal(resident.arrived,true,'resident reaches the south side without paperwork or player orders');
  const saved=Story.serialize(s);
  assert.equal(Story.serialize(Story.restore(saved)),saved,
    'new movement retains the existing v2 checkpoint schema and coordinates');
});

test('original CH01 deployment remains a pre-briefed civilian communications assignment on both endings',()=>{
  for(const choice of ['evacuation','verification']){
    const s=civilianScene();
    s.phase='complete';
    s.world.status='won';
    s.choice=choice;
    for(const reported of [false,true]){
      s.combat.supportUsed=reported;
      const report=Story.debrief(s);
      assert.equal(report.mandate,'preapproved-civilian-communications-cooperation');
      assert.equal(report.predepartureBriefingAcknowledged,true,
        'pre-departure orders were understood before arrival, regardless of an optional Q-key report');
      assert.equal(report.intelligenceRole,'advisory-only');
      assert.ok(report.closingScene.lines.some(text=>text.includes('한국에서 받은 지시')),
        'a changed local situation does not retroactively turn deployment into a war mission');
    }
  }
});