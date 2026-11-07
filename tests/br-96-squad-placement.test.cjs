'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {BrSquadLobby}=require('../src/br-squad-lobby.cjs');
const {BrSquadWorld}=require('../src/br-squad-world.cjs');
const token=n=>n.toString(16).padStart(64,'0');
function session(){
 const lobby=new BrSquadLobby();
 for(let n=0;n<96;n++)assert.equal(lobby.join(token(n),'Human '+n).ok,true);
 for(let n=0;n<96;n++)lobby.ready(token(n),true);
 assert.equal(lobby.phase,'roster_locked');
 return new BrSquadWorld(lobby);
}
test('six independently authenticated withdrawals, not one, retire a six-person squad',()=>{
 const world=session(),initial=world.snapshot(token(12));
 assert.equal(initial.remainingSquads,16);
 assert.equal(initial.standings.length,16);
 assert.equal(initial.standings[0].placement,null);
 for(let n=0;n<5;n++){
  const result=world.withdraw(token(n));
  assert.deepEqual([result.ok,result.remainingSquads,result.squadPlacement],[true,16,null]);
 }
 assert.equal(world.snapshot(token(5)).standings[0].eligibleMembers,1);
 const retired=world.withdraw(token(5));
 assert.deepEqual([retired.ok,retired.remainingSquads,retired.squadPlacement],[true,15,16]);
 assert.equal(world.snapshot(token(12)).standings[0].placement,16);
 assert.equal(world.snapshot(token(12)).phase,'moving');
 assert.equal(world.snapshot(token(0)).self.eligible,false);
 assert.deepEqual(world.move(token(0),{seq:10,dx:1,dz:0}),
  {ok:false,reason:'out_of_round'});
 assert.deepEqual(world.withdraw(token(0)),{ok:false,reason:'already_withdrawn'});
 assert.equal(world.snapshot(token(0)).visible.length,0,
  'a withdrawn spectator cannot inspect enemy coordinates');
 assert.throws(()=>world.withdraw(token(999)),/unknown_session/);
 assert.equal(JSON.stringify(world.snapshot(token(12))).includes(token(6)),false,
  'squad scoreboards cannot leak private bearer credentials');
});
test('server declares exactly one winning squad after fifteen full squad departures',()=>{
 const world=session();
 for(let team=0;team<15;team++){
  for(let slot=0;slot<6;slot++){
   const r=world.withdraw(token(team*6+slot));
   assert.equal(r.ok,true);
   assert.equal(r.squadPlacement,slot===5?16-team:null);
  }
  if(team<14)assert.equal(world.phase,'moving');
 }
 assert.equal(world.phase,'finished');
 assert.equal(world.activeSquads,1);
 const final=world.snapshot(token(90));
 assert.equal(final.phase,'finished');
 assert.equal(final.remainingSquads,1);
 assert.deepEqual(final.standings.map(s=>s.placement),
  [16,15,14,13,12,11,10,9,8,7,6,5,4,3,2,1]);
 assert.equal(final.standings[15].eligibleMembers,6);
 assert.equal(final.self.squad,16);
 assert.equal(final.self.placement,1);
 const tick=world.tick,now=final.self;
 for(let n=0;n<25;n++)world.step();
 assert.equal(world.tick,tick,'no world motion after final placement');
 assert.deepEqual(world.snapshot(token(90)).self,now);
 assert.deepEqual(world.move(token(90),{seq:1,dx:0,dz:1}),
  {ok:false,reason:'out_of_round'});
 assert.deepEqual(world.withdraw(token(90)),{ok:false,reason:'round_complete'});
});
test('unrelated squad cannot forge a rank or remove a peer by issuing movement',()=>{
 const world=session();
 assert.throws(()=>world.move(token(0),{seq:1,dx:0,dz:1,withdraw:true}),
  /invalid_movement/);
 assert.equal(world.activeSquads,16);
 assert.equal(world.snapshot(token(6)).standings[0].eligibleMembers,6);
 assert.equal(world.snapshot(token(6)).standings[1].eligibleMembers,6);
 assert.equal(world.phase,'moving');
});
