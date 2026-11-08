'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {BrSquadLobby}=require('../src/br-squad-lobby.cjs');
const {BrSquadWorld,CROUCH_SPEED,SPEED,SPRINT_SPEED}=require('../src/br-squad-world.cjs');
const Sim=require('../src/simulation.js');
const tokens=Array.from({length:96},(_,i)=>i.toString(16).padStart(64,'0'));
function session(){
 const lobby=new BrSquadLobby();
 for(let i=0;i<96;i++){
  assert.equal(lobby.join(tokens[i],'Participant '+i).ok,true);
 }
 for(const token of tokens)lobby.ready(token,true);
 assert.equal(lobby.phase,'roster_locked');
 return lobby;
}
function runGait(mode){
 const world=new BrSquadWorld(session(),20261108),token=tokens[0];
 const actor=world.actors.get(token);
 actor.x=0;actor.z=0;
 assert.equal(Sim.blocked(actor.x,actor.z,.85,world.obstacles),false);
 assert.equal(world.move(token,{dx:1,dz:0,seq:1}).ok,true);
 assert.equal(world.pace(token,{sprint:mode==='sprint',crouch:mode==='crouch'}).ok,true);
 for(let i=0;i<60;i++)world.step();
 return {world,token,actor};
}
test('96-human BR fixed-step crouch has finite speed and yields to sprint when both keys held',()=>{
 const crouch=runGait('crouch'),walk=runGait('walk'),sprint=runGait('sprint');
 assert.ok(CROUCH_SPEED<SPEED&&SPEED<SPRINT_SPEED);
 assert.ok(crouch.actor.x>0&&crouch.actor.x<walk.actor.x);
 assert.ok(walk.actor.x<sprint.actor.x);
 assert.equal(crouch.actor.stamina,100,'crouching is not sprinting');
 assert.equal(crouch.world.snapshot(crouch.token).self.crouched,true);
 assert.equal(walk.world.snapshot(walk.token).self.crouched,false);
 const overlap=runGait('crouch');
 const actor=overlap.actor;
 overlap.world.pace(overlap.token,{sprint:true,crouch:true});
 assert.equal(actor.crouchHeld,true);
 assert.equal(overlap.world.snapshot(overlap.token).self.crouched,true);
});
test('crouch is authenticated and non-spoofable through server pace validation',()=>{
 const world=new BrSquadWorld(session()),token=tokens[0];
 assert.throws(()=>world.pace(token,{sprint:true,crouch:1}),/invalid_pace/);
 assert.throws(()=>world.pace(token,{sprint:true,crouch:false,x:100}),/invalid_pace/);
 assert.throws(()=>world.pace(token,{crouch:true}),/invalid_pace/);
 assert.deepEqual(world.pace(token,{sprint:false}).ok,true);
 assert.equal(world.snapshot(token).self.crouched,false);
 assert.equal(world.pace(token,{sprint:false,crouch:true}).crouched,true);
 assert.equal(world.pace(token,{sprint:false,crouch:false}).crouched,false);
 assert.equal(world.snapshot(token).self.crouched,false);
});
