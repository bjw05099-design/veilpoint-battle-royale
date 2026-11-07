'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Story=require('../src/story-slice.js');
test('CH01 opens with the captain on his original limited deployment, before unplanned civil-war entanglement',()=>{
 const state=Story.createState();
 assert.equal(state.phase,'terminal');
 assert.match(state.subtitle,/한국에서 출국 전 브리핑받은 임무/);
 assert.match(state.subtitle,/도착하고 나서 충돌이 항구까지 번졌습니다/);
 assert.match(state.subtitle,/현지 구조단/);
 assert.equal(state.choice,null);
 const saved=Story.serialize(state);
 const restored=Story.restore(saved);
 assert.match(restored.subtitle,/체크포인트를 불러왔습니다/,'restore uses the existing checkpoint recap rather than replaying the arrival conversation');
 assert.equal(Story.serialize(restored),saved);
});
test('original deployment followed by unexpected escalation is explicitly binding campaign canon',()=>{
 const canon=fs.readFileSync(path.resolve(__dirname,'../docs/COMBAT_CAMPAIGN_CANON.md'),'utf8');
 assert.match(canon,/Binding story inciting incident/);
 assert.match(canon,/not deployed there with the original intention of fighting a civil war/);
 assert.match(canon,/after he arrives and begins that original mission/);
 assert.match(canon,/Captain.*이수혁/);
});
