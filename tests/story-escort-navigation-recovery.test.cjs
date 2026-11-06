'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Story=require('../src/story-slice.js');
const Navigation=require('../src/navigation.js');

function escortFixture(waiting=true){
 const s=Story.createState();
 s.phase='exit';s.choice='evacuation';s.musterConfirmed=true;
 s.combat.started=true;s.combat.cleared=true;
 for(const actor of s.world.bots){actor.health=0;actor.alive=false;}
 s.guide={active:true,arrived:false,released:false,waiting,
  x:-10.5,z:-55};
 s.world.player.x=0;s.world.player.z=-61;
 return s;
}
function hud(s,selectedId=null){
 const visible=Story.markers(s);
 const incomplete=s.phase==='exit'&&s.choice==='evacuation'&&
  s.guide.active&&!s.guide.arrived&&!s.guide.released;
 const observed=incomplete&&visible.some(m=>m.id==='guideControl');
 const primary=incomplete?(observed?'guideControl':null):
  s.choice==='evacuation'?'exitEvac':'exitVerify';
 return Navigation.story(s.world.player,visible,
  Navigation.markerIndex(visible,selectedId),s.world.obstacles,primary,
  incomplete?Story.situation(s).guideStatus:null);
}
test('CH01 accepted escort no longer auto-guides to blocked courtyard when guide is out of sight',()=>{
 const s=escortFixture();
 assert.ok(Story.markers(s).some(m=>m.id==='exitEvac'));
 assert.ok(!Story.markers(s).some(m=>m.id==='guideControl'));
 const text=hud(s);
 assert.match(text,/동행 경로 확인 필요/);
 assert.match(text,/마지막으로 확인한 위치로 돌아가세요/);
 assert.doesNotMatch(text,/주요 임무 표식.*안뜰/);
 assert.doesNotMatch(text,/-10\.5|-55/,'HUD must not expose hidden companion coordinates');
});
test('CH01 a visible waiting civilian becomes the automatic guide objective',()=>{
 const s=escortFixture();
 s.world.player.x=s.guide.x-3;s.world.player.z=s.guide.z;
 assert.ok(Story.markers(s).some(m=>m.id==='guideControl'));
 assert.match(hud(s),/주요 임무 표식.*동행 재개/);
 assert.doesNotMatch(hud(s),/현재 안내원 위치 미표시/);
});
test('CH01 manual N-key selection retains explicit exit even while optional escort remains blocked',()=>{
 const s=escortFixture();
 const selected=hud(s,'exitEvac');
 assert.match(selected,/선택한 임무 표식.*안뜰/);
 assert.doesNotMatch(selected,/동행 경로 확인 필요/);
 assert.match(hud(s),/동행 경로 확인 필요/);
});
test('CH01 completed or staffed-hand-off escort restores ordinary automatic exit guidance',()=>{
 for(const done of ['arrived','released']){
  const s=escortFixture();
  s.guide.active=done==='arrived';
  s.guide[done]=true;
  assert.match(hud(s),/주요 임무 표식.*안뜰/);
  assert.doesNotMatch(hud(s),/동행 경로 확인 필요/);
 }
});
test('CH01 PC navigation remains read-only and stable through real 60Hz checkpoint continuation',()=>{
 const s=escortFixture();
 const before=Story.serialize(s),selected=Story.restore(before);
 assert.equal(hud(s),hud(selected));
 for(let i=0;i<30;i++)Story.step(selected,1/60,{});
 assert.equal(selected.guide.waiting,true);
 assert.match(hud(selected),/동행 경로 확인 필요/);
 assert.equal(Story.serialize(s),before,'rendering navigation cannot advance saved world state');
});
test('CH01 original BR/CH01 navigation API remains compatible and HUD uses public guide marker',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../src/story-app.js'),'utf8');
 assert.match(source,/const escortIncomplete=state\.phase==='exit'/);
 assert.match(source,/publicMarkers\.some\(marker=>marker\.id==='guideControl'\)/);
 assert.match(source,/state\.world\.obstacles,primaryTarget,escortHint/);
 assert.match(source,/const situation=Story\.situation\(state\)/);
 assert.match(Navigation.story({x:0,z:0,yaw:0},
  [{id:'exitEvac',label:'안뜰',x:0,z:-8}]),/안뜰/);
});
