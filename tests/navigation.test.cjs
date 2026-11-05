'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const nav=require('../src/navigation.js');
const sim=require('../src/simulation.js');
const story=require('../src/story-slice.js');

test('PC bearing uses real yaw, no omniscient opponents and deterministic headings',()=>{
  const p={x:0,z:0,yaw:0};
  assert.equal(nav.direction(p,{x:0,z:-10}).label,'정면');
  assert.equal(nav.direction(p,{x:10,z:0}).label,'오른쪽');
  assert.equal(nav.direction(p,{x:-10,z:0}).label,'왼쪽');
  assert.equal(nav.direction(p,{x:0,z:10}).label,'뒤쪽');
  assert.equal(nav.direction({...p,yaw:Math.PI/2},{x:10,z:0}).label,'정면');
  assert.equal(nav.direction(p,{x:0,z:0}).label,'현재 위치');
  assert.equal(nav.direction({x:NaN,z:0,yaw:0},{x:0,z:0}),null);
});
test('CH01 guidance follows playable 60Hz movement and real mission marker changes',()=>{
  const a=story.createState(),b=story.createState();
  const initial=nav.story(a.world.player,story.markers(a));
  assert.match(initial,/시민 중계기/);
  for(let i=0;i<60;i++){story.step(a,1/60,{forward:true});story.step(b,1/60,{forward:true});}
  assert.equal(nav.story(a.world.player,story.markers(a)),nav.story(b.world.player,story.markers(b)));
  assert.ok(nav.direction(a.world.player,story.markers(a)[0]).meters<
    nav.direction({x:0,z:12,yaw:0},story.markers(a)[0]).meters);
  a.world.player.x=0;a.world.player.z=-18;
  assert.equal(story.interact(a).ok,true);
  assert.match(nav.story(a.world.player,story.markers(a)),/보급 상자/);
  assert.equal(nav.story(a.world.player,[]),'현재 안내할 임무 표식 없음');
  const markers=[{x:0,z:-3,label:'가까운 기록'},{x:40,z:-3,label:'선택한 기록'}];
  assert.match(nav.story({x:0,z:0,yaw:0},markers),/가까운 기록/);
  assert.match(nav.story({x:0,z:0,yaw:0},markers,1),/선택한 임무 표식.*선택한 기록/);
  assert.match(nav.story({x:0,z:0,yaw:0},markers,99),/가장 가까운 임무 표식.*가까운 기록/);
});
test('BR safe-zone guidance distinguishes inside and outside without future zone data',()=>{
  const s=sim.newMatch(20261027,0);
  s.zone.x=0;s.zone.z=0;s.zone.radius=30;
  s.player.x=0;s.player.z=0;s.player.yaw=0;
  assert.match(nav.zone(s.player,s.zone),/내부.*30m/);
  s.player.z=40;
  assert.match(nav.zone(s.player,s.zone),/밖.*10m.*정면/);
  s.player.yaw=Math.PI;
  assert.match(nav.zone(s.player,s.zone),/뒤쪽/);
  assert.equal(nav.zone(s.player,{x:0,z:0,radius:0}),'안전 구역 안내 불가');
});
test('both offline entrypoints load navigation before controller and expose accessible text',()=>{
  for(const [html,controller] of [['index.html','src/app.js'],['story.html','src/story-app.js']]){
    const markup=fs.readFileSync(path.join(__dirname,'..',html),'utf8');
    assert.ok(markup.indexOf('src/navigation.js')<markup.indexOf(controller));
    assert.ok(markup.indexOf('src/navigation.js')>=0);
    assert.match(markup,/id="navigation"[^>]*aria-live="off"/);
    const js=fs.readFileSync(path.join(__dirname,'..',controller),'utf8');
    assert.match(js,/VeilpointNavigation/);
    if(html==='story.html')assert.match(js,/action==='guidance'/);
    assert.match(js,/\$\('navigation'\)\.textContent/);
  }
});


test('CH01 automatic PC navigation prefers primary route and preserves explicit optional-marker cycling',()=>{
  const p={x:0,z:0,yaw:0};
  const markers=[
    {id:'aidPickup',label:'선택 비상 물품',kind:'objective',x:1,z:-2},
    {id:'exitEvac',label:'안전한 안뜰',kind:'evac',x:0,z:-35}
  ];
  assert.match(nav.story(p,markers),/가장 가까운 임무 표식.*선택 비상 물품/);
  assert.match(nav.story(p,markers,null,[],'exitEvac'),
    /주요 임무 표식.*안전한 안뜰.*35m/,
    'the optional pickup must not hijack automatic route completion guidance');
  assert.match(nav.story(p,markers,0,[],'exitEvac'),
    /선택한 임무 표식.*선택 비상 물품/,
    'a PC keyboard player may still select an optional marker explicitly');
  assert.match(nav.story(p,markers,null,[],'missing'),
    /가장 가까운 임무 표식.*선택 비상 물품/,
    'invalid or completed primary targets must safely revert to nearest known marker');
  assert.match(nav.story(p,markers,null,[{x:0,z:-17,w:4,d:2}],'exitEvac'),
    /주요 임무 표식.*직선 경로 차단/,
    'preferred target must not claim an unobstructed walking path through solid scenery');
  assert.equal(JSON.stringify(markers),JSON.stringify([
    {id:'aidPickup',label:'선택 비상 물품',kind:'objective',x:1,z:-2},
    {id:'exitEvac',label:'안전한 안뜰',kind:'evac',x:0,z:-35}
  ]),'read-only navigation cannot alter the mission markers');
});

test('CH01 observed waiting guide can be preferred without exposing a hidden civilian target',()=>{
  const p={x:-6,z:-55,yaw:0};
  const markers=[
    {id:'exitEvac',label:'안전한 안뜰',kind:'evac',x:0,z:-61},
    {id:'guideControl',label:'현장 대기 안내원',kind:'evac',x:-10,z:-55}
  ];
  assert.match(nav.story(p,markers,null,[],'guideControl'),
    /주요 임무 표식.*현장 대기 안내원/);
  assert.match(nav.story(p,markers,0,[],'guideControl'),
    /선택한 임무 표식.*안전한 안뜰/);
  const hidden=markers.slice(0,1);
  assert.doesNotMatch(nav.story(p,hidden,null,[],'guideControl'),/현장 대기 안내원/);
  assert.match(nav.story(p,hidden,null,[],'guideControl'),/가장 가까운 임무 표식.*안전한 안뜰/);
});
