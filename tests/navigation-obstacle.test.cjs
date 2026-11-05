'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Nav=require('../src/navigation.js');
const player={x:0,z:0,yaw:0};
const marker={id:'exit',x:0,z:-20,label:'대피 출구'};
test('CH01 HUD detects authored collision barrier across the direct route',()=>{
  const wall={x:0,z:-10,w:8,d:1};
  assert.equal(Nav.directLineBlocked(player,marker,[wall]),true);
  assert.match(Nav.story(player,[marker],null,[wall]),/직선 경로 차단/);
});
test('CH01 HUD does not invent obstruction outside the route',()=>{
  const wall={x:15,z:-10,w:2,d:2};
  assert.equal(Nav.directLineBlocked(player,marker,[wall]),false);
  assert.doesNotMatch(Nav.story(player,[marker],null,[wall]),/직선 경로 차단/);
});
test('CH01 navigation observes moving gate geometry without stale caching',()=>{
  const gate={x:0,z:-10,w:8,d:1};
  assert.equal(Nav.directLineBlocked(player,marker,[gate]),true);
  gate.x=20;
  assert.equal(Nav.directLineBlocked(player,marker,[gate]),false);
});
test('CH01 navigation preserves selected marker and old API',()=>{
  const markers=[{x:1,z:0,label:'가까운 곳'},marker];
  assert.match(Nav.story(player,markers,1),/대피 출구/);
  assert.match(Nav.story(player,markers,null),/가까운 곳/);
});
test('CH01 navigation ignores invalid collision fixtures safely',()=>{
  assert.equal(Nav.directLineBlocked(player,marker,[null,{x:0,z:-10,w:NaN,d:1}]),false);
  assert.equal(Nav.directLineBlocked(player,marker,undefined),false);
});
