'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {BrSquadLobby}=require('../src/br-squad-lobby.cjs');
const {BrSquadWorld}=require('../src/br-squad-world.cjs');
const Street=require('../src/br96-street-view.js');
const Sim=require('../src/simulation.js');
const token=i=>i.toString(16).padStart(64,'0');
function session(){
 const lobby=new BrSquadLobby();
 for(let i=0;i<96;i++)lobby.join(token(i),'Person '+i);
 for(let i=0;i<96;i++)lobby.ready(token(i),true);
 return new BrSquadWorld(lobby);
}
test('BR96 body heading and walking come from accepted 60Hz displacement, not untrusted intent',()=>{
 const world=session(),actor=world.actors.get(token(0));
 actor.x=0;actor.z=0;
 assert.equal(Sim.blocked(0,0,.85,world.obstacles),false);
 assert.equal(world.move(token(0),{dx:1,dz:0,seq:1}).ok,true);
 world.step();
 const active=world.snapshot(token(0));
 assert.ok(active.self.x>0);
 assert.equal(active.self.moving,true);
 assert.ok(Math.abs(active.self.facing-Math.PI/2)<.0001);
 assert.equal(active.squad[0].facing,active.self.facing);
 const previous=active.self.facing;
 // A wall touching the capsule halts an intention; fake movement cannot
 // turn another player's authoritative head pose.
 actor.direction={x:1,z:0};
 world.obstacles.push({x:actor.x+1.2,z:actor.z,w:.6,d:8,h:2,type:'test-public-wall'});
 for(let i=0;i<15;i++)world.step();
 const stopped=world.snapshot(token(0));
 assert.equal(stopped.self.moving,false);
 assert.equal(stopped.self.facing,previous);
 assert.throws(()=>world.move(token(0),{dx:100,dz:0,seq:2}),/invalid_movement/);
 assert.equal(world.snapshot(token(0)).self.facing,previous);
 const oldSeq=world.move(token(0),{dx:0,dz:-1,seq:2});
 assert.equal(oldSeq.ok,true);
 world.step();
 assert.equal(world.snapshot(token(0)).self.moving,true);
 assert.ok(Math.abs(world.snapshot(token(0)).self.facing)<.00001);
});
test('moving and crouched people are only rendered from server-approved local snapshots',()=>{
 const view=Street.frame({subject:{id:1,x:0,z:0},yaw:0,
  obstacles:[{x:0,z:-12,w:4,d:1,h:3}],
  squad:[{id:2,slot:2,x:2,z:-5,eligible:true,facing:Math.PI/2,moving:true,crouched:true}],
  visible:[{id:9,x:0,z:-19,facing:2,moving:true,crouched:true},
           {id:10,x:-3,z:-6,facing:0,moving:false,crouched:false}],
  visibilityMeters:95});
 assert.equal(view.seen.find(x=>x.id===2).crouched,true);
 assert.equal(view.seen.find(x=>x.id===2).moving,true);
 assert.equal(view.seen.find(x=>x.id===2).facing,Math.PI/2);
 assert.equal(view.seen.some(x=>x.id===9),false,'cover cannot disclose rival posture');
 assert.equal(view.seen.find(x=>x.id===10).slot,null);
 assert.equal(view.seen.find(x=>x.id===10).moving,false);
 const legacy=Street.frame({subject:{id:1,x:0,z:0},yaw:0,
   visible:[{id:7,x:1,z:-4}]});
 assert.equal(legacy.seen[0].facing,null);
 assert.equal(legacy.seen[0].moving,false);
 assert.equal(legacy.seen[0].crouched,false);
});
test('stale or withdrawn person never gains ghost walking animation; new snapshots respect same-squad isolation',()=>{
 const world=session(),a=world.actors.get(token(0));
 a.x=0;a.z=0;
 world.move(token(0),{dx:1,dz:0,seq:1});world.step();
 assert.equal(world.snapshot(token(0)).self.moving,true);
 assert.equal(world.withdraw(token(0)).ok,true);
 assert.equal(world.snapshot(token(0)).self.moving,false);
 const distant=world.snapshot(token(6));
 assert.equal(distant.squad.some(p=>p.id===a.id),false,
   'another squad cannot see a competitor pose through the private roster');
 assert.ok(distant.visible.every(p=>
   typeof p.facing==='number'&&typeof p.moving==='boolean'&&typeof p.crouched==='boolean'));
});
