'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {BrSquadLobby}=require('../src/br-squad-lobby.cjs');
const {BrSquadWorld,SPEED,SPRINT_SPEED,STEP,STAMINA_REARM}=require('../src/br-squad-world.cjs');
const token=n=>n.toString(16).padStart(64,'0');
function liveWorld(){
  const lobby=new BrSquadLobby();
  for(let i=0;i<96;i++)assert.equal(lobby.join(token(i),'Runner '+i).ok,true);
  for(let i=0;i<96;i++)assert.equal(lobby.ready(token(i),true).ok,true);
  return new BrSquadWorld(lobby);
}
test('BR sprint uses server-side physical motion and finite stamina without moving teammates',()=>{
  const walking=liveWorld(),running=liveWorld(),own=token(0),peer=token(1);
  assert.equal(SPEED,4.5);
  assert.ok(SPRINT_SPEED>SPEED);
  const peerBefore=running.snapshot(peer).self;
  const begin=running.snapshot(own).self;
  assert.equal(begin.stamina,100);
  assert.equal(running.snapshot(own).self.sprintHeld,false);
  assert.throws(()=>running.pace(own,{sprint:1}),/invalid_pace/);
  assert.throws(()=>running.pace(own,{sprint:true,stamina:1000}),/invalid_pace/);
  assert.throws(()=>running.pace(own,{sprint:true,x:999}),/invalid_pace/);
  assert.throws(()=>running.pace('f'.repeat(64),{sprint:true}),/unknown_session/);
  assert.equal(running.pace(own,{sprint:true}).ok,true);
  assert.equal(walking.move(own,{seq:1,dx:0,dz:1}).ok,true);
  assert.equal(running.move(own,{seq:1,dx:0,dz:1}).ok,true);
  for(let i=0;i<10;i++){walking.step();running.step();}
  const sprint=running.snapshot(own).self,walk=walking.snapshot(own).self;
  const sprintDistance=Math.hypot(sprint.x-begin.x,sprint.z-begin.z);
  const walkDistance=Math.hypot(walk.x-begin.x,walk.z-begin.z);
  assert.ok(sprintDistance>walkDistance+0.01,'sprint moves farther than normal traversal');
  assert.ok(sprintDistance<=10*STEP*SPRINT_SPEED+1e-8,'server caps distance per tick');
  assert.ok(sprint.stamina<100,'actual sprint travel consumes finite stamina');
  assert.equal(sprint.sprintHeld,true);
  assert.equal(sprint.sprintDepleted,false);
  assert.deepEqual(running.snapshot(peer).self,peerBefore,
    'one authenticated sprint never moves a teammate');
  assert.equal(running.pace(own,{sprint:false}).sprintHeld,false);
  for(let i=0;i<30;i++)running.step();
  assert.ok(running.snapshot(own).self.stamina>sprint.stamina,
    'walking or standing permits bounded recovery');
});
test('exhausted BR sprint cannot restart without server-owned recovery',()=>{
  const w=liveWorld(),own=token(0),actor=w.actors.get(own);
  actor.stamina=0.1;
  assert.equal(w.move(own,{seq:1,dx:0,dz:1}).ok,true);
  assert.equal(w.pace(own,{sprint:true}).ok,true);
  w.step();
  assert.equal(actor.stamina,0);
  assert.equal(actor.sprintDepleted,true);
  const exhausted=w.snapshot(own).self;
  assert.equal(exhausted.sprintDepleted,true);
  assert.equal(w.pace(own,{sprint:true}).ok,true);
  w.step();
  assert.equal(actor.sprintDepleted,true);
  assert.ok(actor.stamina>0,'recovery starts without an instant new sprint');
  for(let i=0;i<200;i++)w.step();
  assert.ok(actor.stamina>=STAMINA_REARM);
  assert.equal(actor.sprintDepleted,false);
  assert.equal(w.pace(own,{sprint:false}).ok,true);
  const clean=w.snapshot(own).self;
  assert.equal(clean.sprintHeld,false);
  assert.equal(clean.sprintDepleted,false);
  assert.ok(clean.stamina<=100);
  assert.equal(w.withdraw(own).ok,true);
  assert.deepEqual(w.pace(own,{sprint:true}),{ok:false,reason:'out_of_round'});
});
