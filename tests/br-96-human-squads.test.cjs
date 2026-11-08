'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {BrSquadLobby,SQUADS,SQUAD_SIZE,CAPACITY}=require('../src/br-squad-lobby.cjs');
const token=i=>i.toString(16).padStart(64,'0');
test('BR fills 16 real human squad rosters of six without overbooking a seat',()=>{
 const lobby=new BrSquadLobby();
 assert.deepEqual([SQUADS,SQUAD_SIZE,CAPACITY],[16,6,96]);
 for(let i=0;i<CAPACITY;i++){
  const joined=lobby.join(token(i),'참가자 '+i);
  assert.deepEqual([joined.ok,joined.team,joined.slot],[true,Math.floor(i/6),i%6]);
 }
 assert.equal(lobby.players.size,96);
 assert.equal(lobby.join(token(1000),'Extra').reason,'lobby_full');
 const snapshot=lobby.snapshot(token(0));
 assert.equal(snapshot.phase,'assembling');
 assert.equal(snapshot.capacity,96);
 assert.deepEqual(snapshot.squadSizes,Array(16).fill(6));
 assert.deepEqual(snapshot.squad.filter(Boolean).map(x=>x.slot),[1,2,3,4,5,6]);
 assert.equal(JSON.stringify(snapshot).includes(token(0)),false,'do not publish bearer tokens');
 assert.equal(JSON.stringify(snapshot).includes('참가자 6'),false,'do not leak rival squads');
});
test('16x6 lobby locks only after all participants send a server-validated ready intent',()=>{
 const lobby=new BrSquadLobby();
 for(let i=0;i<96;i++)lobby.join(token(i),'Member '+i);
 for(let i=0;i<95;i++)assert.equal(lobby.ready(token(i),true).locked,false);
 assert.equal(lobby.snapshot(token(0)).phase,'assembling');
 assert.equal(lobby.ready(token(95),true).locked,true);
 assert.equal(lobby.snapshot(token(0)).phase,'roster_locked');
 assert.equal(lobby.ready(token(0),false).reason,'roster_locked');
 assert.equal(lobby.leave(token(0)).reason,'roster_locked');
 assert.equal(lobby.join(token(99),'Late').reason,'roster_locked');
 assert.deepEqual(lobby.join(token(0),'Member 0'),
  {ok:true,joined:false,team:0,slot:0},'reconnected member keeps their seat');
});
test('vacant slots can be reused without reshuffling other squads',()=>{
 const lobby=new BrSquadLobby();
 for(let i=0;i<14;i++)lobby.join(token(i),'Player '+i);
 lobby.ready(token(0),true);
 assert.equal(lobby.leave(token(1)).ok,true);
 assert.equal(lobby.join(token(44),'Replacement').slot,1);
 assert.equal(lobby.snapshot(token(0)).self.ready,true);
 assert.deepEqual(lobby.snapshot(token(12)).self,{id:13,name:'Player 12',squad:3,slot:1,ready:false},
  'pre-round entry votes must not change existing human identity serialization');
 assert.equal(lobby.snapshot(token(12)).entry.selfChoice,null,
  'unselected ballot is explicit in its own versioned entry namespace');
 assert.equal(lobby.players.size,14);
});
test('clients cannot choose opponents, teams, secret tokens, or force a launch',()=>{
 const lobby=new BrSquadLobby();
 for(const [id,name] of [['hi','Allowed'],[token(3),'\u202eEnemy'],[token(4),'\nHidden'],[token(5),'  ']]){
  assert.throws(()=>lobby.join(id,name),/invalid_(session|display_name)/);
 }
 assert.equal(lobby.join(token(3),'김해안').team,0);
 assert.throws(()=>lobby.snapshot(token(999)),/unknown_session/);
 assert.throws(()=>lobby.ready(token(999),true),/unknown_session/);
 assert.throws(()=>lobby.ready(token(3),'true'),/invalid_ready/);
 assert.throws(()=>lobby.join(token(3),'변경된 이름'),/session_name_mismatch/);
 assert.equal(Object.hasOwn(lobby,'start'),false,'no remote client launch operation');
 assert.equal(lobby.snapshot(token(3)).phase,'assembling');
});
