'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {BrSquadLobby}=require('../src/br-squad-lobby.cjs');
const {BrSquadWorld,LEASE_TICKS}=require('../src/br-squad-world.cjs');
const key=i=>i.toString(16).padStart(64,'0');
function worldWithFullHumanRoster(){
 const lobby=new BrSquadLobby();
 for(let i=0;i<96;i++)lobby.join(key(i),'Player '+i);
 for(let i=0;i<96;i++)lobby.ready(key(i),true);
 return new BrSquadWorld(lobby);
}
function nearCart(world,token,dx,dz){
 const actor=world.actors.get(key(token)),cart=world.handcart.body;
 actor.x=cart.x+dx;actor.z=cart.z+dz;
 return actor;
}
test('96-player server permits a stopped human to hand a single stationary cart to a nearby member of the same six-person squad',()=>{
 const w=worldWithFullHumanRoster(),body=w.handcart.body;
 const owner=nearCart(w,0,0,2.1),teammate=nearCart(w,1,2.1,0);
 const rival=nearCart(w,6,-2.1,0),start={x:body.x,z:body.z};
 assert.equal(w.interactNearby(key(0)).action,'grip');
 assert.equal(w.snapshot(key(1)).handcart.squadOperatorSlot,1);
 assert.equal(w.snapshot(key(6)).handcart.squadOperatorSlot,null);
 assert.equal(w.interactNearby(key(1)).reason,'in_use',
  'an active handcart operator cannot be forcibly replaced');
 assert.equal(w.operateHandcart(key(6)).reason,'in_use');
 w.move(key(0),{dx:0,dz:0,seq:0});
 for(let i=0;i<=LEASE_TICKS;i++)w.step();
 assert.equal(w.cartHandoffAvailable(teammate),true);
 assert.equal(w.cartHandoffAvailable(rival),false);
 const handoff=w.interactNearby(key(1));
 assert.equal(handoff.kind,'handcart');
 assert.equal(handoff.action,'handoff');
 assert.equal(w.handcart.operator,teammate);
 assert.equal(w.snapshot(key(1)).handcart.heldBySelf,true);
 assert.equal(w.snapshot(key(0)).handcart.heldBySelf,false);
 assert.equal(w.snapshot(key(0)).handcart.squadOperatorSlot,2);
 assert.equal(w.snapshot(key(6)).handcart.squadOperatorSlot,null);
 assert.equal(w.snapshot(key(6)).handcart.handoffAvailable,false);
 assert.deepEqual({x:body.x,z:body.z},start);
 w.step();
 assert.deepEqual({x:body.x,z:body.z},start,
  'new operator must issue fresh input; F cannot move the cart for them');
 assert.equal(w.move(key(1),{dx:-1,dz:0,seq:0}).ok,true);
 assert.equal(w.handcart.operator,teammate);
 assert.equal(w.operateHandcart(key(1)).action,'release');
 assert.equal(w.obstacles.filter(o=>o===body).length,1,
  'a transfer never duplicates the physical server obstacle');
});
test('offline and stale opponents cannot steal an operator-controlled public cart',()=>{
 const w=worldWithFullHumanRoster(),a=nearCart(w,0,0,2.1),
   friend=nearCart(w,1,2.1,0),foe=nearCart(w,6,-2.1,0);
 assert.equal(w.operateHandcart(key(0)).action,'grip');
 for(let i=0;i<=LEASE_TICKS+3;i++)w.step();
 assert.equal(w.operateHandcart(key(6)).reason,'in_use');
 assert.equal(w.cartHandoffAvailable(foe),false);
 assert.equal(w.operateHandcart(key(1)).action,'handoff');
 assert.equal(w.handcart.operator,friend);
 assert.equal(w.handcartSnapshot(key(6)).squadOperatorSlot,null);
 assert.equal(w.handcartSnapshot(key(0)).squadOperatorSlot,2);
 assert.equal(w.withdraw(key(1)).ok,true);
 assert.equal(w.handcart.operator,null);
 assert.equal(w.cartHandoffAvailable(a),false);
});
test('cart transfer never bypasses line of sight, distance or a fresh input lease',()=>{
 const w=worldWithFullHumanRoster(),a=nearCart(w,0,0,2.1),
  friend=nearCart(w,1,2.1,0),cart=w.handcart.body;
 assert.equal(w.operateHandcart(key(0)).ok,true);
 for(let i=0;i<=LEASE_TICKS+2;i++)w.step();
 friend.x=cart.x+40;
 assert.equal(w.operateHandcart(key(1)).reason,'out_of_reach');
 friend.x=cart.x+2.1;
 w.move(key(0),{dx:0,dz:0,seq:1});
 assert.equal(w.operateHandcart(key(1)).reason,'in_use');
 assert.equal(w.handcart.operator,a);
});
