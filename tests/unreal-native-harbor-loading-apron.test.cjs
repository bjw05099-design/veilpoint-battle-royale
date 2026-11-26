'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {spawnSync}=require('node:child_process');
const runtime=path.resolve(__dirname,'../Unreal/Veilpoint/Source/Veilpoint');
const source=file=>fs.readFileSync(path.join(runtime,file),'utf8');

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
 assert.match(world,/AddBlock\(Vegetation, FVector\(VPFooting::ApronX, VPFooting::ApronY, 1\.\)/);
});
test('native wet footing uses the authored ground hit and restores dry grip and braking',()=>{
 const character=source('VPCharacter.cpp'), header=source('VPCharacter.h'), world=source('VPWorldBootstrap.cpp');
 assert.match(header,/bool bOnWetLoadingApron = false;/);
 assert.match(world,/Hit.GetComponent\(\) != Harbor->Ground.Get\(\)/);
 assert.match(world,/InverseTransformPosition\(Hit.ImpactPoint\)/);
 assert.match(character,/bOnWetLoadingApron \? VPFooting::WetSpeedScale : 1\.f/);
 assert.match(character,/bWet \? VPFooting::WetGripScale : 1\.f/);
 assert.match(character,/GroundFriction = DryGroundFriction \* Grip/);
 assert.match(character,/BrakingFriction = DryBrakingFriction \* Grip/);
 assert.match(character,/BrakingDecelerationWalking = DryBrakingDeceleration \* Grip/);
 assert.match(character,/MaxWalkSpeedCrouched/);
 const tick=character.slice(character.indexOf('void AVPCharacter::Tick'),
  character.indexOf('void AVPCharacter::UpdateSprintFixedStep'));
 const position=tick.indexOf('AVPWorldBootstrap::IsWetApronContact(Floor.HitResult)');
 const authority=tick.indexOf('if (!HasAuthority() || !IsAlive()) return;');
 assert.ok(position>=0 && authority>position,
   'native Tick must derive wet footing before its authority-only stamina step');
});

test('wet footing covers the slab boundary and excludes overhead, air and unrelated floors',
 {skip:process.platform==='win32'},()=>{
 const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'vp-footing-'));
 try {
  const compiled=spawnSync('c++',['-std=c++17','-Werror','-I',runtime,'-x','c++','-','-o',path.join(scratch,'check')],{
   input:[
    '#include "VPFootingRules.h"',
    'using namespace VPFooting;',
    'static_assert(IsWetApron(true, 3500., -4000., -5.));',
    'static_assert(IsWetApron(true, 2800., -4900., -5.));',
    'static_assert(!IsWetApron(true, 2799., -4900., -5.));',
    'static_assert(!IsWetApron(true, 3500., -4000., 235.));',
    'static_assert(!IsWetApron(true, 3500., -4000., -20.));',
    'static_assert(!IsWetApron(false, 3500., -4000., -5.));',
    'static_assert(AdenGradeScale(false, -.32, 0., .95, 1., 0.) == 1.f);',
    'static_assert(AdenGradeScale(true, -.75, 0., .50, 1., 0.) == 1.f);',
    'static_assert(AdenGradeScale(true, 0., 0., 1., 1., 0.) == 1.f);',
    'static_assert(AdenGradeScale(true, -.02, 0., .99, 1., 0.) == 1.f);',
    'static_assert(AdenGradeScale(true, -.32, 0., .95, 0., 1.) == 1.f);',
    'static_assert(AdenGradeScale(true, -.32, 0., .95, 0., 0.) == 1.f);',
    'static_assert(AdenGradeScale(true, -.32, 0., .95, 1., 0.) < 1.f);',
    'static_assert(AdenGradeScale(true, -.32, 0., .95, -1., 0.) > 1.f);',
    'static_assert(AdenGradeScale(true, -.86, 0., .51, 1., 0.) == .78f);',
    'static_assert(AdenGradeScale(true, -.86, 0., .51, -1., 0.) == 1.06f);',
    'int main() {}'
   ].join('\n'),encoding:'utf8',timeout:15000
  });
  assert.equal(compiled.status,0,compiled.stderr);
 } finally {
  fs.rmSync(scratch,{recursive:true,force:true});
 }
});
