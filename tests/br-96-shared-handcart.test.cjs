'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {BrSquadLobby}=require('../src/br-squad-lobby.cjs');
const {BrSquadWorld,STEP}=require('../src/br-squad-world.cjs');
const Sim=require('../src/simulation.js');
const token=i=>i.toString(16).padStart(64,'0');
function launch(){
 const lobby=new BrSquadLobby();
 for(let i=0;i<96;i++)lobby.join(token(i),'Cart participant '+i);
 for(let i=0;i<96;i++)lobby.ready(token(i),true);
 return new BrSquadWorld(lobby);
}
test('one authenticated human pushes a single real shared handcart in 60Hz ticks, not teleporting or duplicating it',()=>{
 const world=launch(),a=world.actors.get(token(0)),cart=world.handcart.body;
 assert.equal(cart.routeId,'br-dock-handcart');
 a.x=cart.x;a.z=cart.z+2.1;
 const before={x:cart.x,z:cart.z,actorZ:a.z};
 assert.equal(world.operateHandcart(token(1)).reason,'out_of_reach');
 assert.equal(world.operateHandcart(token(0)).action,'grip');
 assert.equal(world.operateHandcart(token(6)).reason,'out_of_reach',
   'a distant rival has no access to operator state or shared handle');
 assert.equal(world.move(token(0),{dx:0,dz:-1,seq:0}).ok,true);
 for(let i=0;i<12;i++)world.step();
 assert.ok(cart.z<before.z,'handcart advances only through real fixed steps');
 assert.ok(cart.z>before.z-Sim.DOCK_HANDCART.speed*STEP*13);
 assert.ok(a.z<before.actorZ,'the person walks with the cart');
 assert.ok(Math.abs((cart.z-before.z)-(a.z-before.actorZ))<1e-6);
 assert.equal(world.snapshot(token(0)).handcart.heldBySelf,true);
 assert.equal(world.snapshot(token(6)).handcart.heldBySelf,false);
 assert.equal(world.obstacles.filter(o=>o.routeId==='br-dock-handcart').length,1);
 assert.equal(world.operateHandcart(token(0)).action,'release');
 const fixed=cart.z;
 for(let i=0;i<10;i++)world.step();
 assert.equal(cart.z,fixed,'releasing prevents remotely moving the cart');
});
test('handcart remains stationary when another body blocks its swept path; withdrawing releases the real operator',()=>{
 const world=launch(),a=world.actors.get(token(0)),b=world.actors.get(token(6)),cart=world.handcart.body;
 a.x=cart.x;a.z=cart.z+2.1;b.x=cart.x;b.z=cart.z-1.3;
 assert.equal(world.operateHandcart(token(0)).ok,true);
 world.move(token(0),{dx:0,dz:-1,seq:0});
 const original=cart.z;
 world.step();
 assert.equal(cart.z,original,'do not push the cart through an actual teammate/opponent');
 assert.equal(world.withdraw(token(0)).ok,true);
 assert.equal(world.handcart.operator,null);
 assert.equal(world.operateHandcart(token(0)).reason,'out_of_round');
});
test('walking away releases the cart, so future movement commands cannot push it remotely',()=>{
 const world=launch(),actor=world.actors.get(token(0)),body=world.handcart.body;
 actor.x=body.x;actor.z=body.z+2.1;
 assert.equal(world.operateHandcart(token(0)).ok,true);
 // Model a legitimate long walk completed while not holding the handle;
 // all world state mutations here are test-fixture-only, never client API.
 actor.x=body.x+15;actor.z=body.z+15;
 world.move(token(0),{dx:0,dz:-1,seq:0});
 const before=body.z;
 world.step();
 assert.equal(body.z,before);
 assert.equal(world.handcart.operator,null);
});
