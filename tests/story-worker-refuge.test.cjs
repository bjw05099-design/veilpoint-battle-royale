'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Story=require('../src/story-slice.js');
const Sim=require('../src/simulation.js');
function cleared(){
 const state=Story.createState(),p=state.world.player;
 p.x=Story.POINTS.terminal.x;p.z=Story.POINTS.terminal.z;
 assert.equal(Story.interact(state).ok,true);
 for(const b of state.world.bots){b.alive=false;b.health=0;}
 state.combat.cleared=true;state.phase='records';
 return state;
}
test('CH01 worker physically clears the public lane independently and the optional local interview remains available',()=>{
 const s=cleared(),p=s.world.player;
 for(let i=0;i<850;i++)Story.step(s,1/60,{});
 assert.equal(s.worker.x,28,'worker actually reaches the existing sidewalk end');
 assert.equal(s.worker.z,-8,'autonomous pedestrian reaches the neighboring open street');
 assert.equal(s.workerInterviewed,false,'a player interview cannot be the safety prerequisite');
 assert.equal(Sim.blocked(s.worker.x,s.worker.z,.55,s.world.obstacles),false);
 const original=Story.serialize(s),before=Story.restore(original);
 assert.deepEqual(before.worker,s.worker,'v2 checkpoint roundtrip preserves physical movement');
 assert.equal(before.workerInterviewed,false);
 p.x=25;p.z=-8;
 assert.equal(Story.interact(s).event,'harbor_worker_interview');
 assert.equal(s.workerInterviewed,true);
 assert.match(s.subtitle,/이미 이동했습니다/,'the civilian does not promise to repeat a completed walk');
 const restored=Story.restore(Story.serialize(s));
 assert.deepEqual(restored.worker,s.worker);
 assert.equal(restored.workerInterviewed,true);
});
test('CH01 worker waits when an occupied pedestrian position obstructs their chosen route',()=>{
 const s=cleared();s.workerInterviewed=true;s.worker={x:28,z:-12,direction:1};
 s.world.worker=s.worker;
 s.world.player.x=28;s.world.player.z=-9.8;
 const before=s.worker.z;
 for(let i=0;i<200;i++)Story.step(s,1/60,{});
 assert.ok(s.worker.z< -10.6,'cannot walk through a stationary body');
 assert.ok(s.worker.z>=before,'no magical backward displacement');
 s.world.player.x=0;s.world.player.z=12;
 for(let i=0;i<300;i++)Story.step(s,1/60,{});
 assert.equal(s.worker.z,-8,'worker continues after pedestrian moves away');
});
test('CH01 saves reject off-path, premature-phase and out-of-world worker relocations',()=>{
 const state=cleared(),data=JSON.parse(Story.serialize(state));
 const saved=JSON.stringify(data);
 assert.equal(Story.serialize(Story.restore(saved)),saved);
 for(const [flag,x,z] of [[false,25,-10],[true,25,-10],[true,28,-5],[false,28,-5],[false,28,-13]]){
  const forged={...data,workerInterviewed:flag,
    worker:{direction:1,x,z}};
  assert.throws(()=>Story.restore(JSON.stringify(forged)),/checkpoint|worker|invalid/i);
 }
 const impossiblePhase={...data,phase:'engagement',worker:{direction:1,x:28,z:-10}};
 assert.throws(()=>Story.restore(JSON.stringify(impossiblePhase)),/checkpoint|worker|invalid/i,
   'an unconfirmed encounter cannot contain a post-clearance pedestrian relocation');
});
