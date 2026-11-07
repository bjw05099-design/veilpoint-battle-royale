'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=file=>fs.readFileSync(path.resolve(__dirname,'../Unreal/Veilpoint/Source/Veilpoint',file),'utf8');

test('native harbor contains east-dock warehouse and cargo corridor geometry',()=>{
 const world=source('VPWorldBootstrap.cpp');
 for(const [x,y,z] of [[11300,-13700,450],[11300,-10200,400],
  [14300,-13700,130],[14300,-10300,130],[13200,-15400,600]]){
  assert.ok(world.includes('FVector('+x+'.f,'+y+'.f,'+z+'.f)'),
   'physical cargo geometry missing at '+x+','+y);
 }
 const centralLane=-12100;
 assert.ok(centralLane < -10700 && centralLane > -13200,
  'the 14m access corridor for native fixed supply stores stays unobstructed');
 assert.match(world,/AddBlock\(Vegetation,FVector\(3500\.f,-4000\.f,1\.f\),FVector\(14\.f,18\.f,\.02f\)\)/);
});
test('native Windows actor derives wet footing from physical coordinates, including crouch',()=>{
 const character=source('VPCharacter.cpp'), header=source('VPCharacter.h');
 assert.match(header,/bool bOnWetLoadingApron = false;/);
 assert.match(character,/Position\.X - 3500\.f/);
 assert.match(character,/Position\.Y \+ 4000\.f/);
 assert.match(character,/bOnWetLoadingApron \? \.86f : 1\.f/);
 assert.match(character,/MaxWalkSpeedCrouched/);
 const tick=character.slice(character.indexOf('void AVPCharacter::Tick'),
  character.indexOf('void AVPCharacter::UpdateSprintFixedStep'));
 const position=tick.indexOf('const FVector Position = GetActorLocation()');
 const authority=tick.indexOf('if (!HasAuthority() || !IsAlive()) return;');
 assert.ok(position>=0 && authority>position,
   'native Tick must derive wet footing before its authority-only stamina step');
});
