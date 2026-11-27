'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const campaign=require('../src/campaign.js');
test('campaign restore rejects rogue choices without advancing chapter',()=>{const p=campaign.freshProgress();p.choices.M99='fake';assert.throws(()=>campaign.deserialize(JSON.stringify(p)),/differ/);});
test('valid campaign choice still survives V1 serialization',()=>{const p=campaign.completeMission(campaign.freshProgress(),'M01','evacuation');assert.deepEqual(campaign.deserialize(campaign.serialize(p)),p);});
