'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {BrSquadLobby}=require('../src/br-squad-lobby.cjs');
const {BrSquadWorld,ROUTE_DESTINATIONS,ROUTE_RENDEZVOUS_TICKS}=require('../src/br-squad-world.cjs');
const token=i=>i.toString(16).padStart(64,'0');
function launch(){
 const lobby=new BrSquadLobby();
 for(let i=0;i<96;i++)lobby.join(token(i),'Human '+i);
 for(let i=0;i<96;i++)lobby.ready(token(i),true);
 return new BrSquadWorld(lobby);
}
function vote(world,choice='ferry'){
 for(let i=0;i<4;i++)assert.equal(world.voteRoute(token(i),choice).ok,true);
}
function gather(world,choice='ferry'){
 const target=ROUTE_DESTINATIONS[choice];
 for(let i=0;i<6;i++){
  const actor=world.actors.get(token(i));
  actor.x=target.x+(i-2.5)*1.8;actor.z=target.z;
  actor.direction={x:0,z:0};
 }
}
test('server confirms a voted six-human on-foot destination only after 120 continuous 60Hz ticks',()=>{
 const world=launch(),self=token(0);
 vote(world);
 const r=world.snapshot(self).squadRoute;
 assert.equal(r.choice,'ferry');
 assert.equal(r.holdRequiredTicks,ROUTE_RENDEZVOUS_TICKS);
 assert.equal(r.confirmedAtTick,null);
 assert.equal(r.arrived<r.eligibleMembers,true);
 gather(world);
 for(let t=0;t<ROUTE_RENDEZVOUS_TICKS-1;t++)world.step();
 let partial=world.snapshot(self).squadRoute;
 assert.equal(partial.holdTicks,ROUTE_RENDEZVOUS_TICKS-1);
 assert.equal(partial.confirmedAtTick,null,'arrival cannot be granted early');
 world.step();
 const final=world.snapshot(self).squadRoute;
 assert.equal(final.holdTicks,ROUTE_RENDEZVOUS_TICKS);
 assert.equal(final.confirmedAtTick,world.tick);
 assert.equal(world.snapshot(token(1)).squadRoute.confirmedAtTick,world.tick);
 assert.equal(world.snapshot(token(6)).squadRoute.confirmedAtTick,null,
   'other squads cannot learn our rendezvous result');
 assert.equal(world.snapshot(self).standings[0].placement,null,
   'rendezvous is a gameplay milestone, never a fabricated victory');
});
test('an absent real member interrupts the hold; changing consensus invalidates the earlier route',()=>{
 const world=launch(),self=token(0);
 vote(world);gather(world);
 for(let t=0;t<75;t++)world.step();
 assert.equal(world.snapshot(self).squadRoute.holdTicks,75);
 world.actors.get(token(5)).x=0;world.actors.get(token(5)).z=0;
 world.step();
 assert.equal(world.snapshot(self).squadRoute.holdTicks,0);
 world.actors.get(token(5)).x=ROUTE_DESTINATIONS.ferry.x;
 world.actors.get(token(5)).z=ROUTE_DESTINATIONS.ferry.z;
 for(let t=0;t<ROUTE_RENDEZVOUS_TICKS;t++)world.step();
 assert.ok(world.snapshot(self).squadRoute.confirmedAtTick!==null);
 for(let i=0;i<4;i++)world.voteRoute(token(i),'shade');
 assert.equal(world.snapshot(self).squadRoute.choice,'shade');
 assert.equal(world.snapshot(self).squadRoute.confirmedAtTick,null);
 world.step();
 assert.equal(world.snapshot(self).squadRoute.holdTicks,0);
});
test('no vote, no human majority, or only one remaining participant cannot claim rendezvous',()=>{
 const world=launch(),self=token(0);
 gather(world);
 for(let t=0;t<ROUTE_RENDEZVOUS_TICKS+5;t++)world.step();
 assert.equal(world.snapshot(self).squadRoute.confirmedAtTick,null);
 for(let i=0;i<3;i++)world.voteRoute(token(i),'ferry');
 for(let t=0;t<ROUTE_RENDEZVOUS_TICKS+5;t++)world.step();
 assert.equal(world.snapshot(self).squadRoute.choice,null);
 assert.equal(world.snapshot(self).squadRoute.confirmedAtTick,null);
 world.voteRoute(token(3),'ferry');
 for(let i=1;i<6;i++)world.withdraw(token(i));
 for(let t=0;t<ROUTE_RENDEZVOUS_TICKS+5;t++)world.step();
 assert.equal(world.snapshot(self).squadRoute.eligibleMembers,1);
 assert.equal(world.snapshot(self).squadRoute.confirmedAtTick,null);
});
