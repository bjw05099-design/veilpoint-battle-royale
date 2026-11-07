'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Campaign=require('../src/campaign.js');

test('CH01 starts with a known Korea briefing and unforeseen local escalation',()=>{
  const beats=Campaign.ch01Causality();
  assert.deepEqual(beats.map(b=>b.order),[0,1,2,3]);
  assert.equal(beats[0].location,'korea');
  assert.match(beats[0].event,/출국 전에/);
  assert.match(beats[0].event,/복귀 계획/);
  assert.match(beats[2].event,/예상하지 못한 내전/);
  assert.match(beats[3].event,/유수프/);
  assert.ok(beats.every(b=>b.requiresInteraction===false));
  assert.ok(beats.every(b=>!/(지시서 수집|장부 인계|체크리스트)/.test(b.event)));
});

test('presentation beats cannot mutate canonical metadata or campaign saves',()=>{
  const beats=Campaign.ch01Causality();
  beats[0].event='altered';
  assert.notEqual(Campaign.ch01Causality()[0].event,'altered');
  const before=Campaign.serialize(Campaign.freshProgress());
  Campaign.ch01Causality();
  assert.equal(Campaign.serialize(Campaign.freshProgress()),before);
  assert.equal(Campaign.deserialize(before).version,Campaign.VERSION);
});
