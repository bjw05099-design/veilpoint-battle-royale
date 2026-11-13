'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Story=require('../src/story-slice.js');
const Causal=require('../src/story-consequences.js');
function readySouthRoute(){
 const s=Story.createState();
 s.world.player.x=Story.POINTS.terminal.x;
 s.world.player.z=Story.POINTS.terminal.z;
 assert.equal(Story.interact(s).ok,true,'real on-foot terminal action begins chapter');
 for(const bot of s.world.bots){bot.health=0;bot.alive=false;}
 s.combat.cleared=true;s.phase='decision';
 assert.equal(Story.choose(s,'evacuation').ok,true);
 assert.equal(s.musterConfirmed,false,'optional muster consultation not pre-granted');
 return s;
}
function events(s){return Causal.fromMission(s).events;}
test('CH01 aid delivery is recognized only after actual on-site F pickup and handoff, without optional muster',()=>{
 const s=readySouthRoute();
 assert.ok(!events(s).includes(Causal.EVENTS.LOCAL_GUIDE));
 assert.ok(!events(s).includes(Causal.EVENTS.LOCAL_AID_OBSERVED));
 s.world.player.x=Story.POINTS.aidPickup.x;
 s.world.player.z=Story.POINTS.aidPickup.z;
 const pickup=Story.interact(s);
 assert.equal(pickup.ok,true);
 assert.equal(s.aidPickedUp,true);assert.equal(s.world.carryingAid,true);
 assert.ok(!events(s).includes(Causal.EVENTS.LOCAL_AID_OBSERVED),
   'picking up a crate cannot count as a witnessed handoff');
 s.world.player.x=Story.POINTS.aidDrop.x;
 s.world.player.z=Story.POINTS.aidDrop.z;
 const handoff=Story.interact(s);
 assert.equal(handoff.ok,true);
 assert.equal(s.aidDelivered,true);
 assert.equal(s.world.aidDelivered,true);
 assert.equal(s.world.carryingAid,false);
 assert.equal(s.musterConfirmed,false);
 const sequence=events(s);
 assert.ok(sequence.includes(Causal.EVENTS.LOCAL_GUIDE));
 assert.ok(sequence.includes(Causal.EVENTS.SAFE_ROUTE));
 assert.ok(sequence.includes(Causal.EVENTS.LOCAL_AID_OBSERVED));
 assert.ok(sequence.indexOf(Causal.EVENTS.SAFE_ROUTE)<sequence.indexOf(Causal.EVENTS.LOCAL_AID_OBSERVED));
 const serialized=Story.serialize(s);
 const loaded=Story.restore(serialized);
 assert.equal(loaded.musterConfirmed,false);
 assert.deepEqual(events(loaded),sequence,
   'V2 checkpoint retains real delivered-aid causality');
});
test('a claimed handoff without matching 60Hz world evidence earns no causal consultation',()=>{
 const s=readySouthRoute();
 s.aidPickedUp=true;s.aidDelivered=true;
 s.world.aidDelivered=false;s.world.carryingAid=false;
 assert.ok(!events(s).includes(Causal.EVENTS.LOCAL_AID_OBSERVED));
 s.world.aidDelivered=true;s.world.carryingAid=true;
 assert.ok(!events(s).includes(Causal.EVENTS.LOCAL_AID_OBSERVED));
 s.world.carryingAid=false;
 s.phase='decision';
 assert.ok(!events(s).includes(Causal.EVENTS.LOCAL_AID_OBSERVED),
   'a fictitious early handoff cannot authorize a future exit');
});
test('same actual handoff never changes CH01 route selection or invents global rescue outcomes',()=>{
 const s=readySouthRoute();
 s.phase='exit';s.choice='evacuation';
 s.aidPickedUp=true;s.aidDelivered=true;
 s.world.aidDelivered=true;s.world.carryingAid=false;
 const result=Causal.fromMission(s);
 assert.equal(result.route,'courtyard');
 assert.equal(result.events.includes(Causal.EVENTS.EXIT),false,
   'a real aid handoff is not the completed physical exit');
 assert.equal(result.briefedBeforeDeparture,true);
 assert.deepEqual(result.events.filter(x=>x===Causal.EVENTS.CIVILIAN_SHUTTLE_ARRIVED),[]);
});
