'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {BrSquadLobby}=require('../src/br-squad-lobby.cjs');
const {BrSquadWorld}=require('../src/br-squad-world.cjs');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const token=i=>i.toString(16).padStart(64,'0');
function round(){
 const lobby=new BrSquadLobby();
 for(let i=0;i<96;i++)assert.equal(lobby.join(token(i),'Human '+i).ok,true);
 for(let i=0;i<96;i++)assert.equal(lobby.ready(token(i),true).ok,true);
 return new BrSquadWorld(lobby);
}
function finishByActualSquads(world){
 for(let i=6;i<96;i++)assert.equal(world.withdraw(token(i)).ok,true);
 assert.equal(world.phase,'finished');
 assert.equal(world.activeSquads,1);
}
test('BR96 team journey aggregates six real server-moved human bodies, not a client score',()=>{
 const world=round();
 assert.equal(world.snapshot(token(0)).squadJourney,null,
   'no unfinished match aggregate or invented winning team');
 assert.equal(world.move(token(0),{dx:1,dz:0,seq:1}).ok,true);
 assert.equal(world.move(token(2),{dx:0,dz:1,seq:1}).ok,true);
 assert.equal(world.pace(token(0),{sprint:true,seq:1}).ok,true);
 for(let i=0;i<55;i++)world.step();
 assert.ok(world.actors.get(token(0)).traveledMeters>0,
   'real 60Hz displacement is required before awarding team distance');
 const current=world.snapshot(token(0));
 assert.equal(current.squadJourney,null);
 finishByActualSquads(world);
 const s=world.snapshot(token(0));
 const group=s.squadJourney;
 assert.equal(group.schema,'veilpoint-br96-squad-journey-v1');
 assert.equal(group.squad,1);assert.equal(group.members,6);
 assert.equal(group.activeMembersAtFinish,6);
 assert.equal(group.ownSquadPlacement,1);
 assert.equal(group.roundTicks,world.tick);
 const members=[...world.actors.values()].filter(p=>p.team===0);
 const to2=n=>Math.round(n*100)/100;
 const total=members.reduce((n,p)=>n+p.traveledMeters,0);
 const sprint=members.reduce((n,p)=>n+p.sprintedMeters,0);
 assert.equal(group.totalMeters,to2(total));
 assert.equal(group.sprintedMeters,to2(sprint));
 assert.equal(group.walkedMeters,to2(Math.max(0,total-sprint)));
 assert.equal(group.participantsMoved,members.filter(p=>p.traveledMeters>1e-7).length);
 for(const forbidden of ['membersBySlot','tokens','coordinates','benchRestTicks',
   'opponents','rivalIds','memberRoutes','stamina'])assert.equal(Object.hasOwn(group,forbidden),false);
 assert.ok(group.totalMeters>0);
 assert.ok(Object.isFrozen(group));
 assert.ok(!JSON.stringify(group).includes(token(0)));
 assert.equal(world.snapshot(token(1)).squadJourney.totalMeters,group.totalMeters,
   'same-team peers see exactly the same post-round aggregate');
 const defeated=world.snapshot(token(6));
 assert.equal(defeated.squadJourney.squad,2);
 assert.equal(defeated.squadJourney.totalMeters,0);
 assert.equal(defeated.squadJourney.ownSquadPlacement,16);
 assert.equal(s.personalRecap.totalMeters,to2(world.actors.get(token(0)).traveledMeters));
 assert.equal(s.personalRecap.schema,'veilpoint-br96-personal-journey-v1',
   'personal report contract remains compatible');
});
function actualJourneyRenderer(){
 const source=fs.readFileSync(path.join(__dirname,'../src/br96-client.js'),'utf8');
 const start=source.indexOf('function renderJourney(w){'),
  end=source.indexOf('function renderStandings(w){',start);
 assert.ok(start>0&&end>start);
 const elements=new Map();
 const context={state:{roundNumber:2},dismissedJourneyRound:-1,
  el(id){if(!elements.has(id))elements.set(id,{hidden:false,textContent:''});return elements.get(id);}};
 const fn=vm.runInNewContext(source.slice(start,end)+'\nrenderJourney',context);
 return {fn,elements,context};
}
test('BR96 PC match report displays real six-person summary but accepts older personal-only snapshots',()=>{
 const {fn,elements}=actualJourneyRenderer();
 const personal={schema:'veilpoint-br96-personal-journey-v1',
  squad:1,participantSlot:1,ownSquadPlacement:1,activeSeconds:1,
  walkedMeters:1,sprintedMeters:2,totalMeters:3,locationsVisited:0,
  ownResult:'active_at_finish'};
 const game={phase:'finished',personalRecap:personal};
 fn(game);
 assert.equal(elements.get('journeyPanel').hidden,false);
 assert.match(elements.get('journeyText').textContent,/실제 보행 거리: 1.00m/);
 assert.doesNotMatch(elements.get('journeyText').textContent,/분대 전체 이동 거리/);
 const group={schema:'veilpoint-br96-squad-journey-v1',squad:1,members:6,
  participantsMoved:3,activeMembersAtFinish:6,ownSquadPlacement:1,
  walkedMeters:9,sprintedMeters:4,totalMeters:13,roundTicks:60};
 fn({...game,squadJourney:group});
 const label=elements.get('journeyText').textContent;
 assert.match(label,/우리 6인 분대의 실제 이동 기록/);
 assert.match(label,/움직인 인원: 3\/6명/);
 assert.match(label,/분대 전체 이동 거리: 13.00m/);
 assert.doesNotMatch(label,/휴식 시간:.*초/);
 assert.ok(label.includes('\n\n우리 6인 분대'));
 fn({...game,squadJourney:{...group,squad:2,totalMeters:10000}});
 assert.doesNotMatch(elements.get('journeyText').textContent,/분대 전체 이동 거리/,
  'wrong-team aggregate cannot masquerade as the authenticated squad');
 fn({...game,phase:'moving'});
 assert.equal(elements.get('journeyPanel').hidden,true);
});
