'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Story=require('../src/story-slice.js');
const Consequences=require('../src/story-consequences.js');

const go=(s,p)=>{s.world.player.x=p.x;s.world.player.z=p.z;};
function afterUnexpectedEscalation(){
 const s=Story.createState();
 go(s,Story.POINTS.terminal);
 assert.equal(Story.interact(s).phase,'engagement');
 for(const residentActor of s.world.bots){residentActor.alive=false;residentActor.health=0;}
 s.combat.cleared=true;s.phase='records';
 return s;
}
test('physically completed CH01 east passage is causally recognized even without any documents',()=>{
 const s=afterUnexpectedEscalation();
 go(s,Story.POINTS.eastLocalRequest);
 const request=Story.interact(s);
 assert.equal(request.event,'east_route_in_person');
 assert.equal(s.choice,'verification');
 assert.deepEqual(s.found,[]);
 assert.equal(s.gateLogReviewed,false);
 assert.deepEqual(Consequences.fromMission(s).events,[
  'arrived','escalation','contact_lost'
 ],'before reaching the public passage do not invent already-confirmed clearance');
 go(s,Story.POINTS.exitVerify);
 Story.step(s,1/60,{});
 assert.equal(s.passageWarningHeard,true);
 assert.ok(!Consequences.fromMission(s).events.includes('local_guide'),
  'a corridor warning alone is not proof of an open exit');
 assert.deepEqual(Story.interact(s),{ok:false,reason:'awaiting_clearance'});
 for(let i=0;i<550;i++)Story.step(s,1/60,{});
 assert.equal(Story.situation(s).eastGateOpen,true);
 go(s,Story.POINTS.exitVerify);
 assert.equal(Story.interact(s).phase,'complete');
 assert.deepEqual(Consequences.fromMission(s).events,[
  'arrived','escalation','contact_lost','local_guide','safe_route','exit'
 ]);
 assert.equal(Consequences.fromMission(s).route,'harbor');
 assert.deepEqual(s.found,[],'no retrospective document collection');
 const saved=Story.serialize(s),restored=Story.restore(saved);
 assert.equal(Story.serialize(restored),saved);
 assert.deepEqual(Consequences.fromMission(restored),Consequences.fromMission(s));
 assert.deepEqual(Story.debrief(s).causalTimeline,Consequences.fromMission(s));
});
test('remote choice, clock-only wait and unobserved route never fabricate local contact',()=>{
 const s=afterUnexpectedEscalation();
 go(s,Story.POINTS.decision);
 assert.equal(Story.interact(s).phase,'decision');
 assert.equal(Story.choose(s,'verification').ok,true);
 s.world.elapsed=s.gateReadyAt+10;
 assert.equal(s.passageWarningHeard,false);
 assert.ok(!Consequences.fromMission(s).events.includes('local_guide'));
 const copied={...s,phase:'complete'};
 assert.ok(!Consequences.fromMission(copied).events.includes('local_guide'),
  'flag-free fabricated exit must not be reported as witnessed local assistance');
 const warningOnly={...s,passageWarningHeard:true,world:{...s.world,elapsed:s.gateReadyAt-1}};
 assert.ok(!Consequences.fromMission({...warningOnly,phase:'complete'}).events.includes('local_guide'));
});
