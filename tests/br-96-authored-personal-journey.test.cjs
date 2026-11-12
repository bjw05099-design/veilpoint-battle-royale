'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {BrSquadLobby}=require('../src/br-squad-lobby.cjs');
const {BrSquadWorld}=require('../src/br-squad-world.cjs');
const Sim=require('../src/simulation.js');
const token=n=>n.toString(16).padStart(64,'0');
function world(){
 const lobby=new BrSquadLobby();
 for(let i=0;i<96;i++)assert.equal(lobby.join(token(i),'Real '+i).ok,true);
 for(let i=0;i<96;i++)assert.equal(lobby.ready(token(i),true).ok,true);
 return new BrSquadWorld(lobby);
}
function finishWithSquadOne(w){
 for(let i=6;i<96;i++)assert.equal(w.withdraw(token(i)).ok,true);
 assert.equal(w.phase,'finished');
}
test('personal journey uses actual server 60Hz movement, never client reported distance',()=>{
 const w=world(),actor=w.actors.get(token(0));
 actor.x=0;actor.z=0;
 assert.equal(w.snapshot(token(0)).personalRecap,null);
 assert.equal(w.move(token(0),{seq:1,dx:1,dz:0}).ok,true);
 for(let i=0;i<15;i++)w.step();
 const walking=actor.traveledMeters;
 assert.ok(walking>0);
 assert.equal(actor.sprintedMeters,0);
 assert.equal(w.pace(token(0),{sprint:true}).ok,true);
 assert.equal(w.move(token(0),{seq:2,dx:1,dz:0}).ok,true);
 for(let i=0;i<15;i++)w.step();
 assert.ok(actor.traveledMeters>walking);
 assert.ok(actor.sprintedMeters>0);
 assert.ok(actor.sprintedMeters<actor.traveledMeters);
 const before=actor.traveledMeters;
 assert.equal(w.move(token(0),{seq:3,dx:0,dz:0}).ok,true);
 assert.equal(w.pace(token(0),{sprint:false}).ok,true);
 for(let i=0;i<20;i++)w.step();
 assert.equal(actor.traveledMeters,before,'standing still cannot earn fake steps');
 finishWithSquadOne(w);
 const report=w.snapshot(token(0)).personalRecap;
 assert.equal(report.schema,'veilpoint-br96-personal-journey-v1');
 assert.equal(report.participantSlot,1);
 assert.equal(report.squad,1);
 assert.equal(report.ownSquadPlacement,1);
 assert.equal(report.roundTicks,w.tick);
 assert.equal(report.ownResult,'active_at_finish');
 assert.ok(report.walkedMeters>0&&report.sprintedMeters>0);
 assert.ok(Math.abs(report.totalMeters-report.walkedMeters-report.sprintedMeters)<=.02);
 assert.equal(report.activeSeconds,Math.round(w.tick/60*100)/100);
 assert.equal(Object.hasOwn(report,'benchRestSeconds'),false,
  'final match report deliberately excludes bench-rest duration while retaining movement stats');
 assert.equal(Object.isFrozen(report),true);
});

test('post-match personal recap remains private under session rotation and never publishes other paths',()=>{
 const w=world();
 const me=w.actors.get(token(0)),rival=w.actors.get(token(6));
 me.x=0;me.z=0;
 rival.x=0;rival.z=10;
 w.move(token(0),{seq:1,dx:1,dz:0});
 for(let i=0;i<25;i++)w.step();
 const ownTravel=me.traveledMeters;
 const replacement='f'.repeat(64);
 assert.equal(w.rebindSession(token(0),replacement).ok,true);
 assert.equal(w.actors.get(replacement),me);
 assert.equal(me.traveledMeters,ownTravel);
 assert.throws(()=>w.snapshot(token(0)),/unknown_session/);
 for(let i=6;i<96;i++)w.withdraw(token(i));
 const result=w.snapshot(replacement),other=w.snapshot(token(6));
 assert.equal(result.phase,'finished');
 assert.equal(result.personalRecap.totalMeters,Math.round(ownTravel*100)/100);
 assert.equal(other.personalRecap.totalMeters,Math.round(rival.traveledMeters*100)/100);
 assert.notDeepEqual(result.personalRecap,other.personalRecap);
 assert.ok(!('personalRecap' in result.squad[0]));
 assert.ok(!('personalRecap' in result.visible));
 assert.equal(JSON.stringify(result).includes(token(0)),false);
 const fresh=world();
 assert.equal(fresh.snapshot(token(0)).personalRecap,null,'the new real round resets history');
});

test('simultaneously finishing squads retain shared tie rather than fabricated journey win',()=>{
 const w=world();
 // The round can expire all authentic human actors in one 60Hz boundary
 // step, even when no sole winning squad survives.
 for(const p of w.actors.values()){
  p.x=172;p.z=172;
  p.outsideStreakTicks=479;
 }
 w.step();
 assert.equal(w.phase,'finished');
 assert.equal(w.snapshot(token(0)).matchOutcome.kind,'shared_tie');
 assert.equal(w.snapshot(token(0)).personalRecap.ownResult,'area_expiry');
 assert.equal(w.snapshot(token(0)).personalRecap.ownSquadPlacement,1);
});

test('only visible personal final report is shown in compact PC UI, not projected opponent data',()=>{
 const client=fs.readFileSync(path.join(__dirname,'../src/br96-client.js'),'utf8');
 const html=fs.readFileSync(path.join(__dirname,'../br96.html'),'utf8');
 assert.match(client,/function renderJourney\(w\)/);
 assert.match(client,/w\?\.phase==='finished'\?w\.personalRecap:null/);
 assert.match(client,/el\('journeyText'\)\.textContent=/);
 assert.match(client,/dismissedJourneyRound===state\?\.roundNumber/);
 assert.match(html,/id="journeyPanel"/);
 assert.match(html,/id="journeyDismiss"/);
 assert.doesNotMatch(client,/window\.localStorage\.setItem\([^\n]*personalRecap/);
 assert.doesNotThrow(()=>new Function(client));
});
