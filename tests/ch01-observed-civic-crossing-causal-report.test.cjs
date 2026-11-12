'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Story=require('../src/story-slice.js');
const Consequences=require('../src/story-consequences.js');
function witnessedState(){
 const s=Story.createState();
 s.phase='records';s.combat.started=true;s.combat.cleared=true;
 const c=s.civicCrossing;
 s.civicCrossing={...c,disrupted:true,assisted:true,
  civilian:{...c.civilian,x:c.destination.x,z:c.destination.z}};
 return s;
}
test('CH01 physically arrived crossing citizen earns a distinct, optional causal report without changing save',()=>{
 const s=witnessedState();
 assert.equal(Story.civicCrossingReached(s),true,'same live CH01 arrival gate');
 const before=JSON.stringify(s),t=Consequences.fromMission(s);
 assert.equal(JSON.stringify(s),before,'debrief is strictly read-only');
 assert.equal(t.events.filter(e=>e===Consequences.EVENTS.CIVIC_CROSSING_REACHED).length,1);
 assert.equal(t.events.includes(Consequences.EVENTS.LOCAL_GUIDE),false);
 assert.equal(t.events.includes(Consequences.EVENTS.SAFE_ROUTE),false);
 assert.equal(t.events.includes(Consequences.EVENTS.EXIT),false);
 assert.deepEqual(Consequences.restoreTimeline(JSON.parse(JSON.stringify(t))),t);
});
test('help, disruption, stage and remote/invalid coordinates never fabricate arrival',()=>{
 const s=witnessedState(),c=s.civicCrossing;
 const hasArrival=()=>Consequences.fromMission(s).events.includes('civic_crossing_reached');
 assert.equal(hasArrival(),true);
 s.civicCrossing={...c,civilian:{...c.civilian,x:c.destination.x+0.5}};
 assert.equal(hasArrival(),false,'still walking is not arrived');
 s.civicCrossing={...c,assisted:false};
 assert.equal(hasArrival(),false,'unassisted physical pose is not an assisted arrival');
 s.civicCrossing={...c,disrupted:false};
 assert.equal(hasArrival(),false,'undisrupted pedestrian does not claim a rescue');
 s.civicCrossing={...c,civilian:{...c.civilian,x:NaN}};
 assert.equal(hasArrival(),false,'invalid save coordinates cannot earn an event');
 s.civicCrossing=c;s.combat.cleared=false;
 assert.equal(hasArrival(),false,'unresolved scene cannot claim safe passage');
 s.combat.cleared=true;s.combat.started=false;
 assert.equal(hasArrival(),false,'before escalation no arrival can be certified');
});
test('legacy CH01 causal report remains restorable without the new optional milestone',()=>{
 let timeline=Consequences.advance(Consequences.newTimeline(),'arrived');
 timeline=Consequences.advance(timeline,'escalation');
 timeline=Consequences.advance(timeline,'contact_lost');
 assert.deepEqual(Consequences.restoreTimeline(JSON.parse(JSON.stringify(timeline))),timeline);
 assert.throws(()=>Consequences.advance(Consequences.newTimeline(),'civic_crossing_reached'),/prerequisite/);
});
