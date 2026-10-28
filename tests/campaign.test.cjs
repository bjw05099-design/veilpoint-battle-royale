'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const c = require('../src/campaign.js');

test('campaign targets 12 distinct chapters and an authored 12-hour total, not measured gameplay', () => {
  assert.equal(c.MISSIONS.length, 12);
  assert.equal(c.TARGET_MINUTES, 720);
  assert.equal(new Set(c.MISSIONS.map(m => m.id)).size, 12);
  assert.equal(new Set(c.MISSIONS.map(m => m.signature)).size, 12);
  assert.deepEqual(c.MISSIONS.map(m => m.order), Array.from({length: 12}, (_, i) => i + 1));
  for (const m of c.MISSIONS) {
    assert.ok(m.targetMinutes >= 45 && m.targetMinutes <= 75);
    assert.equal(m.options.length, 2);
    assert.ok(m.titleKo && m.titleEn && m.decisionKey);
  }
  assert.equal(c.campaignStatus(c.freshProgress()).measuredPlaytimeMinutes, null);
});

test('starts at the first chapter and does not mutate the earlier save on completion', () => {
  const start = c.freshProgress();
  assert.equal(c.nextMission(start).id, 'M01');
  const next = c.completeMission(start, 'M01', 'verification');
  assert.deepEqual(start.completed, []);
  assert.deepEqual(start.choices, {});
  assert.deepEqual(next.completed, ['M01']);
  assert.equal(next.choices.M01, 'verification');
  assert.equal(c.nextMission(next).id, 'M02');
  assert.equal(c.campaignStatus(next).plannedRemainingMinutes, 670);
});

test('chapter skipping, duplicate completion and unknown choices are rejected', () => {
  const start = c.freshProgress();
  assert.throws(() => c.completeMission(start, 'M02', 'fast'), RangeError);
  assert.throws(() => c.completeMission(start, 'M01', 'not-an-option'), RangeError);
  const one = c.completeMission(start, 'M01', 'evacuation');
  assert.throws(() => c.completeMission(one, 'M01', 'verification'), RangeError);
  assert.throws(() => c.completeMission(one, '__proto__', 'verify'), RangeError);
});

test('all twelve authored chapter decisions advance safely into a final ending state', () => {
  let progress = c.freshProgress();
  for (const m of c.MISSIONS) {
    assert.equal(c.nextMission(progress).id, m.id);
    progress = c.completeMission(progress, m.id, m.options[0]);
  }
  assert.equal(c.nextMission(progress), null);
  const status = c.campaignStatus(progress);
  assert.equal(status.completedCount, 12);
  assert.equal(status.metadataSequenceComplete, true);
  assert.equal(status.playableMissionsVerified, 0);
  assert.equal(status.fullyCompleted, false, 'metadata choices are not twelve playable chapters');
  assert.equal(status.plannedRemainingMinutes, 0);
  assert.equal(status.measuredPlaytimeMinutes, null);
  assert.throws(() => c.completeMission(progress, 'M12', 'rebuild'), RangeError);
});

test('campaign progress round-trips only known sequential choices', () => {
  const partial = c.completeMission(c.freshProgress(), 'M01', 'verification');
  assert.deepEqual(c.deserialize(c.serialize(partial)), partial);
  assert.deepEqual(c.deserialize(c.serialize(c.freshProgress())), c.freshProgress());
  assert.throws(() => c.deserialize('not json'), SyntaxError);
  assert.throws(() => c.deserialize('x'.repeat(9000)), TypeError);
  assert.throws(() => c.deserialize(JSON.stringify({version: 99, completed: [], choices: {}})), RangeError);
  assert.throws(() => c.deserialize(JSON.stringify({version: 1, completed: ['M02'], choices: {M02: 'fast'}})), RangeError);
  assert.throws(() => c.deserialize(JSON.stringify({version: 1, completed: ['M01'], choices: {M01: 'made-up'}})), RangeError);
  assert.throws(() => c.deserialize(JSON.stringify({version: 1, completed: ['M01'], choices: {M01: 'evacuation', M02: 'fast'}})), RangeError);
  assert.throws(() => c.deserialize(JSON.stringify({version: 1, completed: [], choices: {M01: 'evacuation'}})), RangeError);
});

test('browser global export is available without dependencies', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../src/campaign.js'), 'utf8');
  const context = vm.createContext({});
  vm.runInContext(source, context, {filename: 'campaign.js'});
  assert.equal(context.VeilpointCampaign.TARGET_MINUTES, 720);
  assert.equal(context.VeilpointCampaign.nextMission(context.VeilpointCampaign.freshProgress()).id, 'M01');
});

test('campaign always follows a fictional ROK special-forces captain', () => {
  assert.equal(c.LEAD.id, 'captain-lee-suhyeok');
  assert.equal(c.LEAD.rankKo, '대위');
  assert.match(c.LEAD.affiliationKo, /대한민국 특수부대/);
  assert.equal(c.LEAD.isPlayer, true);
  assert.ok(c.MISSIONS.every(m => m.protagonistId === c.LEAD.id));
});

test('NIS characters have consistent fictional identities and a combat-first pacing target', () => {
  const nis = c.SUPPORT_CAST.filter(person => person.affiliationKo === '국가정보원');
  assert.equal(nis.length, 2);
  assert.deepEqual(nis.map(person => person.nameKo), ['김지윤', '조현지']);
  assert.deepEqual(nis.map(person => person.genderKo), ['남성', '여성']);
  assert.equal(new Set(c.SUPPORT_CAST.map(person => person.id)).size, c.SUPPORT_CAST.length);
  assert.equal(new Set(c.MISSIONS.map(m => m.combatTheme)).size, 12);
  assert.ok(c.COMBAT_FOCUS.targetShareMin >= 0.6);
  assert.ok(c.COMBAT_FOCUS.targetShareMax <= 0.65);
  assert.equal(c.COMBAT_FOCUS.fullyImplemented, false);
  assert.equal(c.COMBAT_FOCUS.measuredCombatShare, null);
  assert.equal(c.TARGET_MINUTES, 720);
});

test('active campaign documentation never reintroduces retired cast or obsolete current encounter claims',()=>{
  const paths=[
    '../docs/CAMPAIGN_DESIGN.md','../docs/STORY_CAMPAIGN.md',
    '../docs/COMBAT_CAMPAIGN_CANON.md','../docs/CAMPAIGN_IMMERSION_STANDARD.md',
    '../docs/DEMO_DELIVERY_GATES.md'
  ];
  for(const relative of paths){
    const source=fs.readFileSync(path.resolve(__dirname,relative),'utf8');
    assert.doesNotMatch(source,/서진혁|윤서하|강민재|\bYoon\b/,
      relative+' must use the current fictional cast');
    assert.doesNotMatch(source,/three-drone signal encounter|short playable signal-drone encounter|initial non-graphic arcade signal-drone encounter/,
      relative+' must not advertise the retired arcade encounter as current gameplay');
  }
  const canon=fs.readFileSync(path.resolve(__dirname,'../docs/COMBAT_CAMPAIGN_CANON.md'),'utf8');
  assert.match(canon,/김지윤/);
  assert.match(canon,/조현지/);
  assert.match(canon,/이수혁/);
});
