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

test('CH01 PC marker selection follows the same mission identity after dynamic insertion',()=>{
  const original=[{id:'exitEvac',label:'안뜰',x:0,z:-61},
    {id:'aidPickup',label:'비상 물품',x:-7,z:-47},
    {id:'relay',label:'현장 중계기',x:8,z:-42}];
  const selected=Nav.nextMarkerId(original,'exitEvac');
  assert.equal(selected,'aidPickup');
  const changed=[original[0],{id:'guideControl',label:'안내원 대기',x:-9,z:-55},
    original[1],original[2]];
  assert.equal(Nav.markerIndex(changed,selected),2);
  assert.match(Nav.story(player,changed,Nav.markerIndex(changed,selected)),/비상 물품/);
  assert.equal(Nav.nextMarkerId(changed,selected),'relay');
});

test('CH01 stale guidance selection fails safely to nearest published objective',()=>{
  const markers=[{id:'exit',label:'안뜰',x:0,z:-5},
    {id:'relay',label:'중계기',x:10,z:0}];
  assert.equal(Nav.markerIndex(markers,'guideControl'),null);
  assert.match(Nav.story(player,markers,Nav.markerIndex(markers,'guideControl')),/가장 가까운 임무 표식.*안뜰/);
  assert.equal(Nav.nextMarkerId(markers,'guideControl'),'exit');
  assert.equal(Nav.nextMarkerId(markers,'relay'),null,'cycling past last returns to automatic guidance');
  assert.equal(Nav.nextMarkerId([],null),null);
});

test('CH01 stable selection is read-only across 60Hz-like marker changes',()=>{
  const active=[{id:'supply',label:'보급',x:0,z:-5},{id:'guideControl',label:'안내원',x:3,z:-3},
    {id:'aidDrop',label:'물품 인계',x:8,z:-12}];
  const saved=JSON.stringify(active);
  for(let tick=0;tick<60;tick++){
    const markers=tick%2?[active[0],active[2]]:active;
    const index=Nav.markerIndex(markers,'aidDrop');
    assert.equal(markers[index].id,'aidDrop');
    Nav.story(player,markers,index,[{x:0,z:-8,w:2,d:1}]);
  }
  assert.equal(JSON.stringify(active),saved);
});
