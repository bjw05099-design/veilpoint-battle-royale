'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Story=require('../src/story-slice.js');
const Sim=require('../src/simulation.js');
const tick=s=>Story.step(s,1/60,{});

test('ordinary CH01 worker yields on the actual 60Hz pavement to a stationary person and resumes after clearance',()=>{
 const free=Story.createState(),occupied=Story.createState();
 const first=occupied.worker.x;
 // Keep the authored ordinary Mara actor still. No additional quest flag is
 // set: this test places a person at the front of the existing worker lane.
 occupied.mara.x=first+1.15;occupied.mara.z=occupied.worker.z;
 for(let i=0;i<90;i++){tick(free);tick(occupied);}
 assert.ok(free.worker.x>first+.6,'unobstructed worker is actually walking');
 assert.ok(free.worker.x-occupied.worker.x>.5,'a real person blocks the next step');
 assert.equal(Sim.blocked(occupied.worker.x,occupied.worker.z,.55,
  [{x:occupied.mara.x,z:occupied.mara.z,w:1.1,d:1.1}]),false);
 const before=occupied.worker.x;
 occupied.mara.x=60;occupied.mara.z=50;
 for(let i=0;i<90;i++)tick(occupied);
 assert.ok(occupied.worker.x>before+.6,'clearing the pavement resumes finite-speed walking');
 assert.ok(occupied.worker.x<=28,'worker never exits the authored path');
});

test('autonomous CH01 civilian will not overlap another standing resident to reach the south pavement',()=>{
 const state=Story.createState();
 state.phase='records';state.combat.cleared=true;
 const resident=state.civilianWalker;
 // The player is far away; another physical civilian occupies the route.
 state.mara.x=resident.x;state.mara.z=resident.z-1.7;
 const other=()=>({x:state.mara.x,z:state.mara.z,w:1.1,d:1.1});
 for(let i=0;i<120;i++){
  tick(state);
  assert.equal(Sim.blocked(resident.x,resident.z,.55,[other()]),false,
   'the moving resident must yield or find a collision-clear path');
 }
 assert.ok(Number.isFinite(resident.x)&&Number.isFinite(resident.z));
 assert.ok(resident.x>=-4&&resident.x<=-2&&resident.z<=-46);
});

test('unchanged real V2 CH01 pedestrian checkpoints still resume with identical physical positions',()=>{
 const state=Story.createState();
 for(let i=0;i<90;i++)tick(state);
 const saved=Story.serialize(state);
 const replay=Story.restore(saved);
 assert.equal(Story.serialize(replay),saved);
 assert.equal(replay.worker.x,state.worker.x);
 assert.equal(replay.civilianWalker.z,state.civilianWalker.z);
});
