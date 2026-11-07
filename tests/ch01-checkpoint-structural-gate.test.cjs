'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Story=require('../src/story-slice.js');
const Recovery=require('../src/checkpoint-recovery.js');

test('CH01 recovery refuses seemingly positioned but partial 60Hz worlds, then validates backup',()=>{
 const primary=Story.serialize(Story.createState());
 const safe=Story.createState();
 safe.world.player.x=2;
 const backup=Story.serialize(safe);
 const defects=[
  s=>{delete s.world.player.yaw;},
  s=>{s.world.player.charges=NaN;},
  s=>{s.world.elapsed=Infinity;},
  s=>{s.world.bots=null;},
  s=>{s.world.obstacles=undefined;},
  s=>{s.combat=null;},
  s=>{s.found='recordA';},
  s=>{s.phase='unknown';}
 ];
 for(const defect of defects){
  const calls=[];
  const result=Recovery.recover(primary,backup,(p,b)=>{
   calls.push([p,b]);
   if(p===null)return Story.recoverCheckpoint(null,b);
   const forged=Story.restore(p);
   defect(forged);
   return {source:'primary',state:forged};
  });
  assert.equal(result?.source,'backup');
  assert.equal(result.state.world.player.x,2,'fallback is actual saved backup');
  assert.deepEqual(calls,[[primary,backup],[null,backup]]);
 }
 assert.equal(Story.serialize(Story.restore(backup)),backup,
  'rejecting forged restoration never writes or mutates the backup generation');
});

test('CH01 structurally broken decoder output never reaches render loop without backup',()=>{
 const primary=Story.serialize(Story.createState());
 const invalid=Story.restore(primary);
 invalid.world.elapsed=NaN;
 const recovered=Recovery.recover(primary,null,()=>({source:'primary',state:invalid}));
 assert.equal(recovered,null);
});
