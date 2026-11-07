'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {BrSquadLobby}=require('../src/br-squad-lobby.cjs');
const {BrSquadWorld,STEP,RADIUS,LEASE_TICKS}=require('../src/br-squad-world.cjs');
const Sim=require('../src/simulation.js');
const token=i=>i.toString(16).padStart(64,'0');
function started(){
 const lobby=new BrSquadLobby();
 for(let i=0;i<96;i++)assert.equal(lobby.join(token(i),'Participant '+i).ok,true);
 for(let i=0;i<96;i++)lobby.ready(token(i),true);
 assert.equal(lobby.phase,'roster_locked');
 return new BrSquadWorld(lobby);
}
test('all 96 squad members have unique real world bodies and the same physical BR map',()=>{
 const world=started(),actors=[...world.actors.values()];
 assert.equal(actors.length,96);
 assert.equal(new Set(actors.map(p=>p.id)).size,96);
 assert.equal(STEP,1/60);
 for(let i=0;i<96;i++){
  const p=actors[i];
  assert.equal(p.team,Math.floor(i/6));
  assert.equal(p.slot,i%6);
  assert.equal(Sim.blocked(p.x,p.z,RADIUS,world.obstacles),false,
    'no live human spawns inside a physical building');
  for(let j=i+1;j<96;j++){
   const q=actors[j];
   assert.ok(Math.hypot(p.x-q.x,p.z-q.z)>=2*RADIUS,
    'two authentic players cannot share one spawn');
  }
 }
 const ordinary=Sim.newMatch(20261108,0,'carbine');
 assert.deepEqual(world.obstacles,ordinary.obstacles,
  'shared server uses the physical offline BR geometry, not a guessed flat arena');
 assert.equal(world.snapshot(token(0)).mode,'br-96-traversal-prototype');
});
test('real 60Hz input advances one authenticated actor without rewriting other squad poses',()=>{
 const world=started(),before=world.snapshot(token(0));
 const another=world.snapshot(token(6));
 assert.deepEqual(world.move(token(0),{seq:1,dx:0,dz:1}),{ok:true,seq:1});
 for(let i=0;i<15;i++)world.step();
 const after=world.snapshot(token(0));
 assert.equal(after.tick,15);
 assert.ok(after.self.z>before.self.z,'accepted forward intent moves only the own server character');
 assert.ok(Math.hypot(after.self.x-before.self.x,after.self.z-before.self.z)<=15*STEP*4.5+1e-7);
 assert.deepEqual(world.snapshot(token(6)).self,another.self,'other squad is not moved by foreign input');
 assert.equal(world.move(token(0),{seq:1,dx:-1,dz:-1}).reason,'stale_input');
 assert.equal(world.move(token(0),{seq:0,dx:1,dz:0}).reason,'stale_input');
 assert.throws(()=>world.move(token(0),{seq:2,dx:500,dz:0}),/invalid_movement/);
 assert.throws(()=>world.move(token(0),{seq:2,dx:NaN,dz:0}),/invalid_movement/);
 assert.throws(()=>world.move(token(0),{seq:2,dx:1,dz:0,team:3}),/invalid_movement/);
 for(let i=0;i<LEASE_TICKS+100;i++)world.step();
 const settled=world.snapshot(token(0));
 for(let i=0;i<25;i++)world.step();
 assert.deepEqual(world.snapshot(token(0)).self,settled.self,
  'expired command lease cannot move a disconnected player forever');
});
test('shared-actor traversal cannot walk through a grounded city wall',()=>{
 const w=started();
 const actor=w.actors.get(token(0));
 actor.x=59;actor.z=125;
 assert.equal(Sim.blocked(actor.x,actor.z,RADIUS,w.obstacles),false);
 w.move(token(0),{seq:1,dx:1,dz:0});
 for(let i=0;i<20;i++)w.step();
 assert.equal(Sim.blocked(actor.x,actor.z,RADIUS,w.obstacles),false);
 assert.ok(actor.x < 64-0.3-RADIUS+.001,
   'fixed physical market courtyard wall stops the live character');
});
test('one squad can inspect mates but not off-screen enemy coordinates or secret tokens',()=>{
 const w=started();
 let view=w.snapshot(token(0));
 assert.equal(view.squad.length,6);
 assert.deepEqual(view.squad.map(a=>a.slot),[1,2,3,4,5,6]);
 assert.equal(JSON.stringify(view).includes(token(0)),false);
 const me=w.actors.get(token(0)),rival=w.actors.get(token(6));
 me.x=59;me.z=125;rival.x=69;rival.z=125;
 view=w.snapshot(token(0));
 assert.equal(view.visible.some(a=>a.id===rival.id),false,'opaque wall occludes opponent');
 me.x=0;me.z=0;rival.x=3;rival.z=0;
 view=w.snapshot(token(0));
 assert.equal(view.visible.some(a=>a.id===rival.id),true,'nearby unobstructed participant appears');
 rival.x=140;rival.z=140;
 assert.equal(w.snapshot(token(0)).visible.some(a=>a.id===rival.id),false,
  'server does not broadcast out-of-range opponents');
 assert.throws(()=>w.snapshot(token(999)),/unknown_session/);
});
test('the 60Hz world is deterministic for identical squad rosters and command streams',()=>{
 const a=started(),b=started();
 for(let step=0;step<90;step++){
  if(step%15===0){
   for(let n=0;n<96;n++){
    const tokenN=token(n),cmd={seq:1+step/15,dx:n%2?1:-1,dz:(n%3-1)/2};
    assert.deepEqual(a.move(tokenN,cmd),b.move(tokenN,cmd));
   }
  }
  a.step();b.step();
 }
 for(let n=0;n<96;n++)assert.deepEqual(a.snapshot(token(n)),b.snapshot(token(n)));
});
