'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Controls=require('../src/desktop-controls.js');
test('CH01 interaction remapped to old reload key is displayed once, not remapped twice',()=>{
 let settings=Controls.normalize({});
 let result=Controls.bind(settings,'reload','KeyT');
 assert.equal(result.ok,true);
 settings=result.value;
 result=Controls.bind(settings,'interact','KeyR');
 assert.equal(result.ok,true);
 settings=result.value;
 assert.equal(settings.bindings.interact,'KeyR');
 assert.equal(settings.bindings.reload,'KeyT');
 const source='F키 상호작용, R키 장전, R 재장전, F로 확인, E를 선택';
 const expected='R키 상호작용, T키 장전, T 재장전, R로 확인, R를 선택';
 assert.equal(Controls.storyHintText(source,settings.bindings),expected);
 assert.equal(Controls.actionFor('KeyR',settings),'interact');
 assert.equal(Controls.actionFor('KeyT',settings),'reload');
});
test('multiple authored PC hints are mapped from original text only',()=>{
 const settings=Controls.normalize({});
 assert.equal(
  Controls.storyHintText('F키 · R키 · F 누르 · Q 상황 보고 · SPACE 발사',settings.bindings),
  'F키 · R키 · F 누르 · Q 상황 보고 · SPACE 발사');
 const customized={...settings.bindings,interact:'KeyR',reload:'KeyT',support:'KeyF'};
 assert.equal(
  Controls.storyHintText('F키 | R키 | Q 상황 보고 | F를 | F키',customized),
  'R키 | T키 | F 상황 보고 | R를 | R키');
 assert.equal(Controls.storyHintText('모드 시작 · 저장 가능',customized),
  '모드 시작 · 저장 가능');
});
