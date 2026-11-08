'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('CH01 player-facing menu establishes predeparture briefing before unforeseen escalation', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'story.html'), 'utf8');
  const menu = html.match(/<p id="menuText">([\s\S]*?)<\/p>/);
  assert.ok(menu, 'story menu introduction exists');
  assert.match(menu[1], /한국에서 출국하기 전/);
  assert.match(menu[1], /복귀 계획/);
  assert.match(menu[1], /예상하지 못한 내전 확대/);
  assert.match(menu[1], /현지 구조단의 요청/);
  assert.ok(menu[1].indexOf('한국에서 출국하기 전') < menu[1].indexOf('예상하지 못한 내전 확대'));
  assert.doesNotMatch(menu[1], /최초 파견 지시서|지시서 수집/);
});
