'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {BrSquadLobby}=require('../src/br-squad-lobby.cjs');
const {BrSquadWorld}=require('../src/br-squad-world.cjs');
const Sim=require('../src/simulation.js');
const token=i=>i.toString(16).padStart(64,'0');
function world(){
 const lobby=new BrSquadLobby();
 for(let i=0;i<96;i++)lobby.join(token(i),'Human '+i);
 for(let i=0;i<96;i++)lobby.ready(token(i),true);
 return new BrSquadWorld(lobby);
}
test('public ferry shutter physically blocks entry until a player operates it nearby, then moves at 60Hz',()=>{
 const w=world(),actor=w.actors.get(token(0));
 actor.x=-45;actor.z=140;
 const shutter=w.obstacles.find(x=>x.type==='br96-civic-shutter');
 assert.ok(shutter,'same collider must be used by the whole 96-person server world');
 assert.equal(shutter.x,-45);
 assert.equal(Sim.blocked(-45,145,.85,w.obstacles),true);
 assert.equal(w.snapshot(token(0)).civicGate.state,'closed');
 assert.equal(w.operateCivicGate(token(6)).ok,false,'remote squad cannot open a public gate from across the city');
 const opened=w.operateCivicGate(token(0));
 assert.equal(opened.ok,true);
 assert.equal(w.snapshot(token(0)).civicGate.state,'opening');
 assert.equal(w.operateCivicGate(token(0)).reason,'in_motion','input spam cannot reverse a moving door');
 for(let i=0;i<60*5;i++)w.step();
 assert.equal(w.snapshot(token(0)).civicGate.state,'open');
 assert.ok(shutter.x< -52);
 assert.equal(Sim.blocked(-45,145,.85,w.obstacles),false,'gap is real not merely a visual door');
 assert.ok(w.snapshot(token(6)).civicGate.state==='open','all 16 squads observe the same public solid');
});
test('returning public shutter stops if a living actor occupies its physical path',()=>{
 const w=world(),actor=w.actors.get(token(0));
 actor.x=-45;actor.z=140;
 assert.equal(w.operateCivicGate(token(0)).ok,true);
 for(let i=0;i<300;i++)w.step();
 actor.x=-47;actor.z=145;
 assert.equal(w.operateCivicGate(token(0)).ok,true,'both sides of a public access door can operate it');
 for(let i=0;i<300;i++)w.step();
 assert.notEqual(w.snapshot(token(0)).civicGate.state,'closed');
 assert.equal(Sim.blocked(actor.x,actor.z,.85,[w.obstacles.find(o=>o.type==='br96-civic-shutter')]),false,
  'no moving door may overlap a player body');
 actor.z=140;
 for(let i=0;i<300;i++)w.step();
 assert.equal(w.snapshot(token(0)).civicGate.state,'closed');
 assert.equal(w.snapshot(token(0)).self.eligible,true);
});
test('public gate keeps server-owned position across authenticated session rebind and refuses retired players',()=>{
 const w=world(),actor=w.actors.get(token(0));
 actor.x=-45;actor.z=140;
 w.operateCivicGate(token(0));
 for(let i=0;i<30;i++)w.step();
 const current=w.snapshot(token(0)).civicGate;
 assert.ok(current.x< -45&&current.x> -52.5);
 const replacement=token(1000);
 w.rebindSession(token(0),replacement);
 assert.deepEqual(w.snapshot(replacement).civicGate,current);
 assert.throws(()=>w.snapshot(token(0)),/unknown_session/);
 w.withdraw(replacement);
 assert.equal(w.operateCivicGate(replacement).reason,'out_of_round');
 assert.throws(()=>w.operateCivicGate('fake'),/unknown_session/);
});
