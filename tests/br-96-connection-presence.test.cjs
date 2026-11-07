'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {BrSquadLobby}=require('../src/br-squad-lobby.cjs');
const {BrSquadWorld,PRESENCE_STALE_TICKS}=require('../src/br-squad-world.cjs');
const token=i=>i.toString(16).padStart(64,'0');
function started(){
 const lobby=new BrSquadLobby();
 for(let i=0;i<96;i++)lobby.join(token(i),'Player '+i);
 for(let i=0;i<96;i++)lobby.ready(token(i),true);
 return new BrSquadWorld(lobby);
}
test('96-person server observes stale connectivity without fake disqualifications or winners',()=>{
 const w=started();
 assert.equal(PRESENCE_STALE_TICKS,600);
 assert.equal(w.snapshot(token(0)).self.connection,'fresh');
 for(let i=0;i<600;i++)w.step();
 const stale=w.snapshot(token(0));
 assert.equal(stale.self.connection,'stale');
 assert.equal(stale.squad.length,6);
 assert.ok(stale.squad.every(m=>m.connection==='stale'));
 assert.equal(stale.remainingSquads,16,'a dropped heartbeat is NOT a squad defeat');
 assert.equal(stale.phase,'moving');
 assert.equal(stale.standings.every(s=>s.eligibleMembers===6&&s.placement===null),true);
 assert.equal(w.heartbeat(token(0)).ok,true);
 assert.equal(w.snapshot(token(0)).self.connection,'fresh');
 assert.equal(w.snapshot(token(1)).squad[0].connection,'fresh',
  'a teammate can observe a peer connection status');
 assert.equal(w.snapshot(token(6)).squad.some(p=>p.id===w.actors.get(token(0)).id),false,
  'another squad does not get private peer roster data');
 assert.equal(w.snapshot(token(1)).squad[1].connection,'stale',
  'the heartbeat of one participant cannot refresh their teammates');
 for(let i=0;i<599;i++)w.step();
 assert.equal(w.snapshot(token(0)).self.connection,'fresh');
 w.step();
 assert.equal(w.snapshot(token(0)).self.connection,'stale');
 assert.equal(w.activeSquads,16);
});
test('accepted input and private team signals refresh only their own session presence',()=>{
 const w=started();
 for(let i=0;i<600;i++)w.step();
 assert.equal(w.snapshot(token(0)).self.connection,'stale');
 assert.equal(w.move(token(0),{seq:1,dx:0,dz:0}).ok,true);
 assert.equal(w.snapshot(token(0)).self.connection,'fresh');
 assert.equal(w.signal(token(1),'regroup').ok,true);
 assert.equal(w.snapshot(token(1)).self.connection,'fresh');
 assert.equal(w.snapshot(token(2)).self.connection,'stale');
 assert.throws(()=>w.heartbeat(token(1000)),/unknown_session/);
 assert.equal(w.withdraw(token(1)).ok,true);
 assert.deepEqual(w.heartbeat(token(1)),{ok:false,reason:'out_of_round'});
 assert.equal(w.snapshot(token(1)).self.connection,'stale');
});
