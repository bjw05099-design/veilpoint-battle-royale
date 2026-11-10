'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {BrSquadLobby}=require('../src/br-squad-lobby.cjs');
const {BrSquadWorld,BOUNDARY_GRACE_TICKS}=require('../src/br-squad-world.cjs');
const token=i=>i.toString(16).padStart(64,'0');
function start(){
 const lobby=new BrSquadLobby();
 for(let i=0;i<96;i++)assert.equal(lobby.join(token(i),'Visitor '+i).ok,true);
 for(let i=0;i<96;i++)assert.equal(lobby.ready(token(i),true).ok,true);
 return new BrSquadWorld(lobby);
}
test('BR96 actual 96-human squads receive their own bounded chronological withdrawal log only',()=>{
 const w=start();
 assert.deepEqual(w.snapshot(token(0)).squadTimeline,[]);
 assert.equal(w.withdraw(token(0)).ok,true);
 assert.equal(w.withdraw(token(1)).ok,true);
 const own=w.snapshot(token(2)),rival=w.snapshot(token(6));
 assert.deepEqual(own.squadTimeline,[
  {slot:1,tick:0,reason:'voluntary_withdrawal',remainingMembers:5},
  {slot:2,tick:0,reason:'voluntary_withdrawal',remainingMembers:4}
 ]);
 assert.deepEqual(rival.squadTimeline,[]);
 assert.equal(own.standings[0].eligibleMembers,4);
 assert.equal(own.remainingSquads,16);
 assert.equal(w.withdraw(token(0)).reason,'already_withdrawn');
 assert.equal(w.squadTimeline[0].length,2,'double withdrawals cannot create extra events');
 assert.equal(w.rebindSession(token(2),token(200)).ok,true);
 assert.deepEqual(w.snapshot(token(200)).squadTimeline,own.squadTimeline);
 assert.throws(()=>w.snapshot(token(2)),/unknown_session/);
 for(const entry of own.squadTimeline){
  assert.deepEqual(Object.keys(entry).sort(),['reason','remainingMembers','slot','tick']);
  assert.equal(JSON.stringify(entry).includes(token(0)),false);
 }
});
test('BR96 simultaneous 60Hz area expirations retain one server tick and equal squad counts',()=>{
 const w=start();
 for(const id of [0,1]){
  const actor=w.actors.get(token(id));
  actor.x=10000;actor.z=10000;
  actor.outsideStreakTicks=BOUNDARY_GRACE_TICKS-1;
 }
 w.step();
 const records=w.snapshot(token(2)).squadTimeline;
 assert.equal(w.tick,1);
 assert.deepEqual(records,[
  {slot:1,tick:1,reason:'area_expiry',remainingMembers:4},
  {slot:2,tick:1,reason:'area_expiry',remainingMembers:4}
 ]);
 assert.deepEqual(w.snapshot(token(6)).squadTimeline,[]);
 assert.equal(w.placements[0],null);
 assert.equal(w.snapshot(token(2)).standings[0].eligibleMembers,4);
 for(let i=0;i<5;i++)w.step();
 assert.equal(w.snapshot(token(2)).squadTimeline.length,2,
  'past boundary expiration cannot repeat once a human is no longer eligible');
});
test('BR96 six same-squad withdrawals remain bounded and preserve authentic 16-squad rank',()=>{
 const w=start();
 for(let id=0;id<6;id++)assert.equal(w.withdraw(token(id)).ok,true);
 const snapshot=w.snapshot(token(0));
 assert.equal(snapshot.squadTimeline.length,6);
 assert.equal(snapshot.squadTimeline.at(-1).remainingMembers,0);
 assert.equal(snapshot.standings[0].placement,16);
 assert.equal(snapshot.remainingSquads,15);
 for(let i=0;i<6;i++)
  assert.deepEqual(snapshot.squadTimeline[i],{
   slot:i+1,tick:0,reason:'voluntary_withdrawal',remainingMembers:5-i});
 assert.equal(w.snapshot(token(6)).squadTimeline.length,0);
});
test('PC HUD reads ONLY the authenticated server departure log; existing personal recap hides bench time',()=>{
 const ui=fs.readFileSync(path.resolve(__dirname,'../src/br96-client.js'),'utf8');
 assert.match(ui,/w\.squadTimeline\?\.length/);
 assert.match(ui,/분대 실제 퇴장/);
 assert.match(ui,/w\.squadTimeline\.at\(-1\)\.reason/);
 assert.doesNotMatch(ui,/benchRestSeconds\s*\+|벤치 휴식 시간/);
});
