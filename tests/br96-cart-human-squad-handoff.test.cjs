'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {BrSquadLobby}=require('../src/br-squad-lobby.cjs');
const {BrSquadWorld,LEASE_TICKS}=require('../src/br-squad-world.cjs');
const token=i=>i.toString(16).padStart(64,'0');
function launch(){
 const lobby=new BrSquadLobby();
 for(let i=0;i<96;i++)lobby.join(token(i),'Transfer walker '+i);
 for(let i=0;i<96;i++)lobby.ready(token(i),true);
 return new BrSquadWorld(lobby);
}
function atHandle(world,id,side=1){
 const body=world.handcart.body,actor=world.actors.get(token(id));
 actor.x=body.x;actor.z=body.z+side*2.1;
 actor.direction={x:0,z:0};
 return actor;
}
test('BR96 actual idle squadmate can take over one stationary cart via F without teleport or automated motion',()=>{
 const world=launch(),cart=world.handcart.body;
 const old=atHandle(world,0,1),next=atHandle(world,1,-1);
 assert.equal(world.interactNearby(token(0)).kind,'handcart');
 assert.equal(world.handcart.operator,old);
 assert.equal(world.operateHandcart(token(1)).reason,'in_use',
   'nearby teammate cannot steal the handle while input lease is active');
 const before={x:cart.x,z:cart.z};
 for(let i=0;i<LEASE_TICKS+1;i++)world.step();
 assert.equal(world.snapshot(token(1)).handcart.handoffAvailable,true);
 const result=world.interactNearby(token(1));
 assert.deepEqual({ok:result.ok,action:result.action,kind:result.kind},
   {ok:true,action:'handoff',kind:'handcart'});
 assert.equal(world.handcart.operator,next);
 assert.deepEqual({x:cart.x,z:cart.z},before);
 assert.equal(world.snapshot(token(1)).handcart.heldBySelf,true);
 assert.equal(world.snapshot(token(0)).handcart.squadOperatorSlot,2);
 assert.equal(world.snapshot(token(6)).handcart.squadOperatorSlot,null);
 assert.equal(world.snapshot(token(6)).handcart.handoffAvailable,false);
 world.step();
 assert.deepEqual({x:cart.x,z:cart.z},before,
   'handoff requires new operator input before the next actual 60Hz displacement');
 assert.equal(world.move(token(1),{dx:0,dz:1,seq:0}).ok,true);
 world.step();
 assert.ok(cart.z>=before.z,'a genuine subsequent input advances or safely blocks the shared cart');
 assert.equal(world.obstacles.filter(x=>x.routeId==='br-dock-handcart').length,1);
 assert.equal(world.operateHandcart(token(1)).action,'release');
 assert.equal(world.handcart.operator,null);
});
test('BR96 distant, opponent, blocked and active owner grips never become remote forced handoffs',()=>{
 const world=launch(),cart=world.handcart.body;
 const old=atHandle(world,0,1);
 assert.equal(world.operateHandcart(token(0)).action,'grip');
 for(let i=0;i<LEASE_TICKS+2;i++)world.step();
 assert.equal(world.operateHandcart(token(1)).reason,'in_use',
   'same-squad person is still at their natural spawn, not at the cart');
 const rival=atHandle(world,6,-1);
 assert.equal(world.operateHandcart(token(6)).reason,'in_use',
   'opponent has no cart takeover privilege');
 rival.x+=30;rival.z+=30;
 const mate=atHandle(world,1,-1);
 const wall={x:cart.x,z:cart.z-1,w:2,d:.45,h:2,type:'test-visible-wall'};
 world.obstacles.push(wall);
 assert.equal(world.snapshot(token(1)).handcart.handoffAvailable,false);
 assert.equal(world.operateHandcart(token(1)).reason,'in_use');
 world.obstacles.pop();
 assert.equal(world.operateHandcart(token(1)).action,'handoff');
 assert.equal(world.handcart.operator,mate);
 assert.equal(world.handcart.operator===old,false);
 // An authenticated session rotation retains the single physical operator.
 assert.equal(world.rebindSession(token(1),token(200)).ok,true);
 // Secure transport rotation must release a held cart and neutralize stale
 // movement. The physical body remains stationary; there is no remote grip.
 assert.equal(world.handcart.operator,null);
 assert.equal(world.snapshot(token(200)).handcart.heldBySelf,false);
 assert.equal(world.snapshot(token(200)).handcart.squadOperatorSlot,undefined);
 assert.throws(()=>world.snapshot(token(1)),/unknown_session/);
});
