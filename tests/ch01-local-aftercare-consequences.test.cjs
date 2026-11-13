'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Consequences=require('../src/story-consequences.js');
const Story=require('../src/story-slice.js');
const Ambience=require('../src/story-harbor-ambience.js');

function localAftermath({aidDelivered=false,choice='evacuation',musterConfirmed=true,
 civilianWalker={arrived:false},transportVan=null,worldConfirmed=true}={}){
 // Model both halves of the actual CH01 F-key handoff; a mission flag
 // alone is never proof that the 60Hz world transferred the physical crate.
 return {world:{elapsed:120,aidDelivered:aidDelivered&&worldConfirmed,
   carryingAid:false},phase:'complete',
  choice,musterConfirmed,aidPickedUp:aidDelivered,aidDelivered,
  civilianWalker,transportVan,combat:{started:true}};
}
test('a physical local aid handoff creates an optional, causally ordered future thread',()=>{
 const witnessed=Consequences.fromMission(localAftermath({aidDelivered:true}));
 assert.deepEqual(witnessed.events,[
  'arrived','escalation','contact_lost','local_guide','safe_route',
  'local_aid_observed','exit'
 ]);
 assert.equal(witnessed.route,'courtyard');
 assert.deepEqual(Consequences.restoreTimeline(JSON.parse(JSON.stringify(witnessed))),witnessed);
 const without=Consequences.fromMission(localAftermath({
  aidDelivered:false,transportVan:{arrived:true}}));
 assert.equal(without.events.includes('local_aid_observed'),false,
  'vehicle arrival is not an actual supply handoff or proof of evacuation');
 assert.equal(without.events.includes('exit'),true,
  'optional aftercare must not gate the preexisting CH01 completion');
 assert.throws(()=>Consequences.advance(Consequences.newTimeline(),'local_aid_observed'),
  /Missing causal prerequisite/);
});
test('verified aftercare never invents a guide for the east path or a civilian headcount',()=>{
 const east=Consequences.fromMission(localAftermath({
  choice:'verification',aidDelivered:true,musterConfirmed:false
 }));
 assert.equal(east.events.includes('local_aid_observed'),false);
 assert.equal(east.events.includes('local_guide'),false);
 const noGuide=Consequences.fromMission(localAftermath({
  choice:'evacuation',musterConfirmed:false,aidDelivered:true,
  worldConfirmed:false
 }));
 assert.equal(noGuide.events.includes('local_aid_observed'),false,
  'a claim without the matching physical world transfer is not witnessed');
});
test('only the real local relief yard changes its synthetic sound after the recorded handoff',()=>{
 const story=Story.createState();
 story.phase='exit';story.choice='evacuation';
 story.world.player.x=-12;story.world.player.z=-60;
 const before=Ambience.profile(story);
 assert.equal(before.area,'relief-courtyard');
 assert.equal(before.witnessedAid,false);
 story.aidDelivered=true;
 const afterward=Ambience.profile(story);
 assert.equal(afterward.witnessedAid,true);
 assert.equal(afterward.lowHz,56);
 assert.equal(afterward.highHz,119);
 assert.notEqual(afterward.highHz,before.highHz);
 story.world.player.x=24;story.world.player.z=-35;
 assert.equal(Ambience.profile(story).witnessedAid,false,
  'the rest of the city never gains fabricated relief status');
 story.world.player.x=-12;story.world.player.z=-60;
 story.phase='terminal';
 assert.equal(Ambience.profile(story).witnessedAid,false,
  'pre-incident city does not contain future aid outcomes');
});
test('CH01 closing follow-through and verified record distinguish delivered from unknown assistance',()=>{
 const state=Story.createState();
 state.phase='complete';state.choice='evacuation';
 const before=Story.closingScene(state);
 assert.equal(before.aftercare,'unverified');
 assert.match(before.nextChapter,/복귀 계획은 미확정/);
 state.aidDelivered=true;
 const after=Story.closingScene(state);
 assert.equal(after.aftercare,'verified_local_supply_handoff');
 assert.match(after.nextChapter,/물품 인수 확인/);
 assert.match(after.nextChapter,/복귀 경로는 계속 미확정/);
 state.aidDelivered=false;state.civilianWalker.arrived=true;
 assert.equal(Story.closingScene(state).aftercare,'one_witnessed_walk_in');
 assert.equal(Story.closingScene(state).nextChapter,before.nextChapter);
});
