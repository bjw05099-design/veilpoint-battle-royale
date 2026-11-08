'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {BrSquadLobby}=require('../src/br-squad-lobby.cjs');
const {BrSquadWorld,ROUTE_DESTINATIONS}=require('../src/br-squad-world.cjs');
const tokens=Array.from({length:96},(_,n)=>(n+1).toString(16).padStart(64,'0'));
function fullWorld(){
 const lobby=new BrSquadLobby();
 for(let n=0;n<96;n++)assert.equal(lobby.join(tokens[n],'Citizen '+n).ok,true);
 for(const token of tokens)assert.equal(lobby.ready(token,true).ok,true);
 assert.equal(lobby.phase,'roster_locked');
 return new BrSquadWorld(lobby,20261108);
}
function teamTokens(world,team){
 return [...world.actors].filter(([_,actor])=>actor.team===team).map(([token])=>token);
}
test('six genuine squad members establish only an actual majority route; no fabricated consensus',()=>{
 const world=fullWorld(),squad=teamTokens(world,0),other=teamTokens(world,1);
 assert.equal(squad.length,6);
 const starting=world.snapshot(squad[0]);
 assert.equal(starting.squadRoute.choice,null);
 assert.equal(starting.squadRoute.target,null);
 const pose={x:starting.self.x,z:starting.self.z,tick:world.tick};
 for(let i=0;i<3;i++)assert.equal(world.voteRoute(squad[i],'ferry').ok,true);
 const tied=world.snapshot(squad[0]).squadRoute;
 assert.equal(tied.tally.ferry,3);
 assert.equal(tied.target,null,'half is not a majority of six people');
 assert.equal(world.snapshot(other[0]).squadRoute.tally.ferry,0,
   'an opponent squad never receives private voting information');
 assert.equal(world.voteRoute(squad[3],'ferry').ok,true);
 const agreed=world.snapshot(squad[0]);
 assert.equal(agreed.squadRoute.choice,'ferry');
 assert.deepEqual(agreed.squadRoute.target,{id:'ferry',...ROUTE_DESTINATIONS.ferry});
 assert.equal(agreed.squadRoute.tally.ferry,4);
 assert.equal(agreed.self.routeChoice,'ferry');
 assert.equal(world.tick,pose.tick);
 assert.equal(agreed.self.x,pose.x);
 assert.equal(agreed.self.z,pose.z,'a vote never teleports an actor');
 assert.equal(agreed.squadRoute.arrived,0,'a vote cannot fabricate walking arrival');
 assert.equal(world.phase,'moving','no match placement changes on voting');
});
test('changing votes and a genuinely withdrawn member recalculate only the eligible squad',()=>{
 const world=fullWorld(),squad=teamTokens(world,0);
 for(let i=0;i<3;i++)world.voteRoute(squad[i],'shade');
 assert.equal(world.snapshot(squad[0]).squadRoute.choice,null);
 world.voteRoute(squad[3],'civic');
 world.withdraw(squad[5]); // nonvoting seat; remaining five now have real majority
 let route=world.snapshot(squad[0]).squadRoute;
 assert.equal(route.eligibleMembers,5);
 assert.equal(route.choice,'shade');
 assert.equal(route.tally.shade,3);
 world.voteRoute(squad[1],'civic');
 route=world.snapshot(squad[0]).squadRoute;
 assert.equal(route.choice,null,'no agreed destination after the majority dissolves');
 assert.equal(route.tally.civic,2);
 assert.equal(world.voteRoute(squad[5],'shade').ok,false);
});
test('route voting validates authenticated choice and reads actual physical team arrivals',()=>{
 const world=fullWorld(),squad=teamTokens(world,0);
 assert.throws(()=>world.voteRoute(squad[0],'__proto__'),/invalid_route_choice/);
 assert.throws(()=>world.voteRoute(squad[0],{id:'ferry'}),/invalid_route_choice/);
 assert.throws(()=>world.voteRoute('missing-token','ferry'),/unknown_session/);
 for(let i=0;i<4;i++)world.voteRoute(squad[i],'shade');
 const target=world.snapshot(squad[0]).squadRoute.target;
 const actor=world.actors.get(squad[1]);
 actor.x=target.x;actor.z=target.z;
 assert.equal(world.snapshot(squad[0]).squadRoute.arrived,1);
 actor.x=0;actor.z=0;
 assert.equal(world.snapshot(squad[0]).squadRoute.arrived,0);
});
