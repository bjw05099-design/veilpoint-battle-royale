'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Story=require('../src/story-slice.js');
test('CH01 opens with the captain on his original limited deployment, before unplanned civil-war entanglement',()=>{
 const state=Story.createState();
 assert.equal(state.phase,'terminal');
 assert.match(state.subtitle,/원래는 현지 상황 확인과 제한적인 대피 지원 때문에 파견/);
 assert.match(state.subtitle,/내전이 이렇게 격화될 줄은 몰랐/);
 assert.match(state.subtitle,/유수프 구조단/);
 assert.equal(state.choice,null);
 const saved=Story.serialize(state);
 const restored=Story.restore(saved);
 assert.equal(restored.subtitle,state.subtitle,'new opening must survive checkpoint restoration');
 assert.equal(Story.serialize(restored),saved);
});
test('original deployment followed by unexpected escalation is explicitly binding campaign canon',()=>{
 const canon=fs.readFileSync(path.resolve(__dirname,'../docs/COMBAT_CAMPAIGN_CANON.md'),'utf8');
 assert.match(canon,/Binding story inciting incident/);
 assert.match(canon,/not deployed there with the original intention of fighting a civil war/);
 assert.match(canon,/after he arrives and begins that original mission/);
 assert.match(canon,/Captain.*이수혁/);
});
