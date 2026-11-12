'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Story=require('../src/story-slice.js');
const Recovery=require('../src/checkpoint-recovery.js');

function actualIncident(){
  const state=Story.createState();
  state.world.player.x=Story.POINTS.terminal.x;
  state.world.player.z=Story.POINTS.terminal.z;
  Story.interact(state);
  assert.equal(state.phase,'engagement');
  const saved=Story.serialize(state);
  return Story.restore(saved);
}

test('CH01 recovery falls back to prior physical checkpoint before invalid player or actor positions can tick',()=>{
  const safe=actualIncident(),original=Story.serialize(safe);
  assert.ok(safe.world.bots.length>0);
  const broken=[
    s=>{s.world.player.x=175;},
    s=>{s.world.player.z=-175;},
    s=>{s.world.bots[0].x=176;},
    s=>{s.world.bots[0].z=-176;},
    s=>{s.world.bots[0].angle=NaN;},
    s=>{s.world.bots[0].moveTime=Infinity;},
    s=>{s.world.bots[0].actionTime=NaN;},
    s=>{s.world.bots[0].alive='yes';}
  ];
  for(const damage of broken){
    const calls=[];
    const recovered=Recovery.recover(original,original,(primary,backup)=>{
      calls.push([primary,backup]);
      if(primary===null)return Story.recoverCheckpoint(null,backup);
      const forged=Story.restore(primary);
      damage(forged);
      return {source:'primary',state:forged};
    });
    assert.equal(recovered?.source,'backup');
    assert.equal(Story.serialize(recovered.state),original,
      'restore previous generation without rewriting the lived CH01 progress');
    assert.deepEqual(calls,[[original,original],[null,original]]);
  }
});

test('valid 60Hz NPC motion resumes from the actual latest V2 checkpoint unchanged',()=>{
  const saved=Story.serialize(actualIncident());
  const restored=Recovery.recover(saved,'{bad previous checkpoint',Story.recoverCheckpoint);
  assert.equal(restored.source,'primary');
  assert.equal(Story.serialize(restored.state),saved);
  const terminal=Story.serialize(Story.createState());
  const fresh=Recovery.recover(terminal,null,Story.recoverCheckpoint);
  assert.equal(fresh.source,'primary');
  assert.equal(Story.serialize(fresh.state),terminal);
});
