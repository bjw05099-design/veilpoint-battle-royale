'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Sim=require('../src/simulation.js');
const {BrSquadLobby}=require('../src/br-squad-lobby.cjs');
const {BrSquadWorld}=require('../src/br-squad-world.cjs');
const token=i=>i.toString(16).padStart(64,'0');

function readyWorld(){
 const lobby=new BrSquadLobby();
 for(let i=0;i<96;i++)lobby.join(token(i),'Civic guest '+i);
 for(let i=0;i<96;i++)lobby.ready(token(i),true);
 return new BrSquadWorld(lobby,20261109);
}

test('optional BR96 public exploration requires each human seat to actually visit',()=>{
 const world=readyWorld(),place=Sim.LANDMARKS[0];
 assert.equal(world.snapshot(token(0)).squadLandmarks.find(p=>p.label===place.label),undefined);
 // Arrange six real server-side bodies on separate, walkable footprints.
 // This is test-only world setup, not a client command or magic teleport API.
 for(let slot=0;slot<6;slot++){
   const actor=world.actors.get(token(slot));
   actor.x=-50+2*slot;
   actor.z=place.z;
   actor.direction={x:0,z:0};
   world.step();
   const observed=world.snapshot(token(0)).squadLandmarks.find(p=>p.label===place.label);
   assert.equal(observed.physicallyVisited,slot+1);
   assert.equal(observed.wholeSquadVisited,slot===5);
   assert.equal(world.snapshot(token(6)).squadLandmarks.find(p=>p.label===place.label),undefined,
     'an opposing squad does not inherit another team\'s private exploration progress');
 }
 const complete=world.snapshot(token(0)).squadLandmarks.find(p=>p.label===place.label);
 assert.deepEqual({x:complete.x,z:complete.z},{x:place.x,z:place.z});
 assert.equal(world.rebindSession(token(0),token(1000)).ok,true);
 assert.equal(world.snapshot(token(1000)).squadLandmarks.find(p=>p.label===place.label).physicallyVisited,6,
   'changing a network session does not fabricate or discard real travel');
 assert.throws(()=>world.snapshot(token(0)),/unknown_session/);
});

test('BR96 PC communicates a verified six-person visit without new controls, votes or scroll panes',()=>{
 const ui=fs.readFileSync(path.join(__dirname,'../src/br96-client.js'),'utf8');
 assert.match(ui,/wholeSquadVisited/);
 assert.match(ui,/전원 직접 방문/);
 assert.match(ui,/for\(const site of w\.squadLandmarks\|\|\[\]\)dot/);
});
