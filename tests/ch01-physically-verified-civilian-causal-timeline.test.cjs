'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Story=require('../src/story-slice.js');
const C=require('../src/story-consequences.js');

function records(){
 const s=Story.createState();
 s.combat.started=true;s.combat.cleared=true;s.phase='records';
 return s;
}
test('CH01 causal ledger records one independently arrived resident at a real grounded endpoint',()=>{
 const s=records();s.civilianWalker.x=-2;s.civilianWalker.z=-58;
 s.civilianWalker.arrived=true;
 const before=JSON.stringify(s);
 const timeline=C.fromMission(s);
 assert.equal(JSON.stringify(s),before,'read-only causal log never mutates V2 save');
 assert.equal(timeline.events.filter(e=>e==='civilian_walk_in').length,1);
 assert.equal(timeline.events.includes('local_guide'),false,
  'one arrived resident does not invent a conversation with local coordinator');
 assert.equal(timeline.events.includes('safe_route'),false);
 assert.equal(timeline.events.includes('exit'),false,
  'independent civilian agency is not proof of completed player route');
 assert.deepEqual(C.restoreTimeline(JSON.parse(JSON.stringify(timeline))),timeline);
 assert.equal(C.advance(timeline,'civilian_walk_in'),timeline,'single occurrence only');
});
test('a lone arrival flag, incomplete trajectory or stage before escalation cannot certify arrival',()=>{
 const s=records();
 s.civilianWalker.arrived=true;
 assert.equal(C.fromMission(s).events.includes('civilian_walk_in'),false);
 for(const [x,z] of [[-2,-48],[-50,-58],[0,0],[NaN,-58],[Infinity,-58]]){
  s.civilianWalker.x=x;s.civilianWalker.z=z;
  assert.equal(C.fromMission(s).events.includes('civilian_walk_in'),false,
   'a remote or invalid position must not fabricate a resident arrival');
 }
 s.civilianWalker.x=-4;s.civilianWalker.z=-58;
 assert.equal(C.fromMission(s).events.includes('civilian_walk_in'),true,
  'original aid-lane endpoint is also reachable without forced movement');
 s.combat.cleared=false;
 assert.equal(C.fromMission(s).events.includes('civilian_walk_in'),false);
 s.combat.cleared=true;s.combat.started=false;
 assert.equal(C.fromMission(s).events.includes('civilian_walk_in'),false);
});
test('old causal timelines remain restorable and optional arrival cannot be inserted before escalation',()=>{
 let t=C.newTimeline();t=C.advance(t,C.EVENTS.ARRIVED);
 assert.throws(()=>C.advance(t,C.EVENTS.CIVILIAN_WALK_IN),/prerequisite/);
 t=C.advance(t,C.EVENTS.ESCALATION);
 t=C.advance(t,C.EVENTS.CONTACT_LOST);
 const old=C.restoreTimeline(JSON.parse(JSON.stringify(t)));
 assert.deepEqual(old,t);
 const now=C.advance(t,C.EVENTS.CIVILIAN_WALK_IN);
 assert.equal(now.events.length,t.events.length+1);
 assert.equal(now.briefedBeforeDeparture,true);
 assert.equal(now.originalMandate,'civilian liaison and communications support');
 assert.equal(now.route,null);
 assert.equal(C.restoreTimeline(JSON.parse(JSON.stringify(now))).events.at(-1),'civilian_walk_in');
});
