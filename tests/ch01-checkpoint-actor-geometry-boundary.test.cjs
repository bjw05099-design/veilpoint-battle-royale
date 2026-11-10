'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Story=require('../src/story-slice.js');
const Recovery=require('../src/checkpoint-recovery.js');

const playable=()=>Story.restore(Story.serialize(Story.createState()));

test('CH01 resumed checkpoint refuses broken actor coordinates and collision extents, keeping the prior generation',()=>{
  const good=playable();
  assert.ok(good.world.bots.length>0,'the live CH01 state must contain actual NPC actors');
  assert.ok(good.world.obstacles.length>0,'the live CH01 state must contain solid scene geometry');
  const corruptions=[
    s=>{s.world.bots[0].x=NaN;},
    s=>{s.world.bots[0].z=Infinity;},
    s=>{s.world.bots[0].health=NaN;},
    s=>{s.world.obstacles[0].w=0;},
    s=>{s.world.obstacles[0].d=-1;},
    s=>{s.world.obstacles[0].z=NaN;}
  ];
  for(const corrupt of corruptions){
    const damaged=playable();corrupt(damaged);
    const calls=[];
    const restored=Recovery.recover('primary-saved-bytes','backup-saved-bytes',(primary,backup)=>{
      calls.push([primary,backup]);
      return primary===null?{source:'backup',state:playable()}:{source:'primary',state:damaged};
    });
    assert.equal(restored.source,'backup','the older playable checkpoint must take precedence over malformed NPC/collision state');
    assert.equal(Story.serialize(restored.state),Story.serialize(good),
      'restoring must not alter the validated prior CH01 mission');
    assert.deepEqual(calls,[['primary-saved-bytes','backup-saved-bytes'],[null,'backup-saved-bytes']]);
  }
});

test('CH01 does not resume a geometry-corrupted backup when both generations are unavailable or unreadable',()=>{
  for(const breakWorld of [
    s=>{s.world.bots[0]=null;},
    s=>{s.world.obstacles[0]={x:0,z:0,w:Infinity,d:1};},
    s=>{s.world.obstacles[0]={x:0,z:0,w:1,d:0};}
  ]){
    const damaged=playable();breakWorld(damaged);
    assert.equal(Recovery.recover(null,'backup-saved-bytes',()=>({source:'backup',state:damaged})),null);
  }
});

test('CH01 v2 recovery still resumes a real serialized primary without rewriting its progress',()=>{
  const saved=Story.createState();
  saved.world.player.x=3;saved.world.player.z=9;
  const raw=Story.serialize(saved);
  const result=Recovery.recover(raw,'{broken',Story.recoverCheckpoint);
  assert.equal(result.source,'primary');
  assert.equal(Story.serialize(result.state),raw);
});
