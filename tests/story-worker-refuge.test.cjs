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
test('CH01 witness independently walks to an adjacent civilian sidewalk only after real conversation',()=>{
 const s=cleared(),p=s.world.player;
 for(let i=0;i<480;i++)Story.step(s,1/60,{});
 assert.equal(s.worker.x,28,'worker first reaches the existing physical sidewalk end');
 assert.equal(s.worker.z,-12,'an unconsulted witness never receives an automatic relocation');
 p.x=27;p.z=-12;
 assert.equal(Story.interact(s).event,'harbor_worker_interview');
 assert.equal(s.workerInterviewed,true);
 p.x=0;p.z=12;
 const start=Story.serialize(s);
 const first=Story.step(s,1/60,{});
 assert.ok(s.worker.z>-12&&s.worker.z< -8);
 assert.equal(s.worker.x,28);
 assert.equal(first,s);
 for(let i=0;i<300;i++)Story.step(s,1/60,{});
 assert.equal(s.worker.z,-8,'worker is physically at nearby street after 60Hz movement');
 assert.equal(s.worker.x,28);
 assert.equal(Sim.blocked(s.worker.x,s.worker.z,.55,s.world.obstacles),false);
 const restored=Story.restore(Story.serialize(s));
 assert.deepEqual(restored.worker,s.worker);
 const old=Story.restore(start);
 assert.equal(old.worker.z,-12);
 assert.equal(old.workerInterviewed,true);
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
test('CH01 saves reject fabricated relocated witnesses without voluntary action',()=>{
 const state=cleared(),data=JSON.parse(Story.serialize(state));
 const saved=JSON.stringify(data);
 assert.equal(Story.serialize(Story.restore(saved)),saved);
 for(const [flag,x,z] of [[false,28,-10],[true,25,-10],[true,28,-5]]){
  const forged={...data,workerInterviewed:flag,
    worker:{direction:1,x,z}};
  assert.throws(()=>Story.restore(JSON.stringify(forged)),/checkpoint|worker|invalid/i);
 }
});
