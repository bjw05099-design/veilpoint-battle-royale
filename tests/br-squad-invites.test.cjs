'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {BrSquadLobby,CAPACITY,SQUAD_SIZE}=require('../src/br-squad-lobby.cjs');
const token=i=>i.toString(16).padStart(64,'0');
test('a verified squad invitation recruits only into its existing six-person squad',()=>{
 const lobby=new BrSquadLobby();
 for(let i=0;i<7;i++)assert.equal(lobby.join(token(i),'Member '+i).ok,true);
 const invite=lobby.invite(token(6));
 assert.equal(invite.ok,true);
 assert.match(invite.code,/^[0-9a-f]{32}$/);
 assert.equal(invite.squad,2);
 assert.equal(lobby.invite(token(6)).code,invite.code,'inviter gets stable private capability');
 assert.equal(lobby.leave(token(2)).ok,true,'make an earlier squad seat vacant');
 const join=lobby.join(token(7),'Friend',invite.code);
 assert.deepEqual({team:join.team,slot:join.slot},{team:1,slot:1});
 const ordinary=lobby.join(token(8),'Newcomer');
 assert.deepEqual({team:ordinary.team,slot:ordinary.slot},{team:0,slot:2});
 const own=lobby.snapshot(token(6)),other=lobby.snapshot(token(8));
 assert.deepEqual(own.squad.filter(Boolean).map(x=>x.name),['Member 6','Friend']);
 assert.equal(JSON.stringify(own).includes(invite.code),false);
 assert.equal(JSON.stringify(other).includes(invite.code),false);
 assert.equal(JSON.stringify(own).includes(token(7)),false);
 assert.throws(()=>lobby.join(token(9),'Invalid','anything'),/invalid_invite_code/);
 assert.deepEqual(lobby.join(token(9),'Nobody','e'.repeat(32)),
   {ok:false,reason:'invite_unavailable'});
 assert.equal(lobby.leave(token(6)).ok,true);
 assert.deepEqual(lobby.join(token(9),'Nobody',invite.code),
   {ok:false,reason:'invite_unavailable'},'a departing owner revokes access');
});
test('invitations do not overflow squads, change readiness, or bypass full-roster lock',()=>{
 const lobby=new BrSquadLobby();
 for(let i=0;i<SQUAD_SIZE;i++)lobby.join(token(i),'Full '+i);
 assert.deepEqual(lobby.invite(token(0)),{ok:false,reason:'squad_full'});
 const leader=token(SQUAD_SIZE);
 lobby.join(leader,'Leader');
 const inv=lobby.invite(leader);
 assert.equal(inv.ok,true);
 for(let i=SQUAD_SIZE+1;i<SQUAD_SIZE*2;i++)
   assert.equal(lobby.join(token(i),'Friend '+i,inv.code).team,1);
 assert.deepEqual(lobby.join(token(200),'Overflow',inv.code),
   {ok:false,reason:'squad_full'});
 for(let i=SQUAD_SIZE*2;i<CAPACITY;i++)lobby.join(token(i),'Other '+i);
 for(let i=0;i<CAPACITY;i++)lobby.ready(token(i),true);
 assert.equal(lobby.phase,'roster_locked');
 assert.equal(lobby.invites.size,0);
 assert.deepEqual(lobby.invite(leader),{ok:false,reason:'roster_locked'});
 assert.deepEqual(lobby.join(token(101),'Late',inv.code),{ok:false,reason:'roster_locked'});
 assert.deepEqual(lobby.snapshot(leader).squadSizes,Array(16).fill(6));
});
