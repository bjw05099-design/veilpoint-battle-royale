'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const Story=require('../src/story-slice.js');
const Causal=require('../src/story-consequences.js');

test('CH01 historical perspectives arise from a voluntary face-to-face local decision, never a paper hunt',()=>{
 const s=Story.createState();
 assert.deepEqual(Causal.fromMission(s).events,['arrived']);
 assert.equal(Causal.fromMission(s).briefedBeforeDeparture,true);
 // Model the conclusion of the authored unforeseen event without altering any
 // civilian ownership of the route or requiring an invented dispatch paper.
 s.combat.started=true;s.combat.cleared=true;s.phase='records';
 for(const b of s.world.bots){b.alive=false;b.health=0;}
 s.world.player.x=-9;s.world.player.z=-55;
 const result=Story.interact(s);
 assert.equal(result.ok,true);
 assert.equal(result.event,'coordinatorRequest');
 assert.equal(s.phase,'exit');
 assert.equal(s.choice,'evacuation');
 assert.deepEqual(s.found,[],'the route is never locked behind historical records');
 for(const year of ['2011','2014','2015','2019'])
  assert.ok(s.subtitle.includes(year),'the Yemen chronology is embodied in a local voice: '+year);
 assert.match(s.subtitle,/남쪽 통로는 우리가 관리한다/);
 assert.match(s.subtitle,/우리 눈으로 확인하지 못한 주민을 모두 대피했다고 말할 수는 없어/);
 assert.doesNotMatch(s.subtitle,/여기서 새 파견 지시|2015년에 한국에서 받은 임무/);
});
test('mission consequences are read-only: civilian consultation is never assumed from a mere route selection',()=>{
 const s=Story.createState();
 s.combat.started=true;s.combat.cleared=true;s.phase='complete';s.choice='evacuation';
 for(const b of s.world.bots){b.alive=false;b.health=0;}
 const partial=Story.debrief(s);
 assert.deepEqual(partial.causalTimeline.events,['arrived','escalation','contact_lost']);
 assert.equal(partial.causalTimeline.route,null);
 assert.equal(partial.causalTimeline.events.includes('exit'),false);
 assert.equal(partial.campaignUnlocked,false);
 assert.equal(partial.eastCheckpointCleared,false);
 // A real local coordinator check in the existing mission is the only basis
 // for reporting explicit local guidance in the parallel story chronicle.
 s.musterConfirmed=true;
 const reported=Story.debrief(s);
 assert.deepEqual(reported.causalTimeline.events,
  ['arrived','escalation','contact_lost','local_guide','safe_route','exit']);
 assert.equal(reported.causalTimeline.route,'courtyard');
 assert.deepEqual(Causal.restoreTimeline(reported.causalTimeline),{
  version:1,briefedBeforeDeparture:true,
  originalMandate:'civilian liaison and communications support',
  events:['arrived','escalation','contact_lost','local_guide','safe_route','exit'],
  route:'courtyard'
 });
 assert.equal(reported.protagonist,'이수혁');
 assert.equal(reported.campaignUnlocked,false);
 assert.throws(()=>reported.causalTimeline.events.push('fake'),TypeError);
});
test('east route and old v2 saves never fabricate local guide consultation, civilian arrival or new checkpoint fields',()=>{
 const s=Story.createState();
 const old=Story.serialize(s);
 assert.equal(Story.serialize(Story.restore(old)),old);
 assert.equal(Object.hasOwn(JSON.parse(old),'causalTimeline'),false);
 s.combat.started=true;s.combat.cleared=true;s.choice='verification';
 s.phase='complete';
 for(const b of s.world.bots){b.alive=false;b.health=0;}
 assert.equal(Story.debrief(s).causalTimeline.events.includes('local_guide'),false);
 assert.equal(Story.debrief(s).causalTimeline.events.includes('exit'),false);
 s.gateLogReviewed=true;
 const confirmed=Story.debrief(s).causalTimeline;
 assert.equal(confirmed.route,'harbor');
 assert.equal(confirmed.events.includes('exit'),true);
 assert.deepEqual(Story.debrief(s).records,[]);
});
test('fictional harbor story integrates a separate causal script in the actual offline browser',()=>{
 const root=path.resolve(__dirname,'..');
 const html=fs.readFileSync(path.join(root,'story.html'),'utf8');
 const story=fs.readFileSync(path.join(root,'src/story-slice.js'),'utf8');
 const first=html.indexOf('src/story-consequences.js');
 const second=html.indexOf('src/story-slice.js');
 assert.ok(first>0&&second>first,'browser must load the real event model before the story slice');
 assert.match(story,/Consequences\.fromMission\(state\)/);
 assert.match(story,/2011년 예멘의 시위/);
 assert.match(story,/2014년 사나가 장악되고 2015년 아덴/);
 assert.doesNotMatch(story,/historicalFactCollected|newHistoricalDispatchQuest/);
});
