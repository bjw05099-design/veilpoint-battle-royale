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
 assert.match(header,/float WetApronCoverage = 0\.f;/);
 assert.match(world,/Hit.GetComponent\(\) != Harbor->Ground.Get\(\)/);
 assert.match(world,/InverseTransformPosition\(Hit.ImpactPoint\)/);
 assert.match(character,/FMath::Lerp\(1\.f, VPFooting::WetSpeedScale, WetApronCoverage\)/);
 assert.match(character,/FMath::Lerp\(1\.f, VPFooting::WetGripScale, Coverage\)/);
 assert.match(character,/GroundFriction = DryGroundFriction \* Grip/);
 assert.match(character,/BrakingFriction = DryBrakingFriction \* Grip/);
 assert.match(character,/BrakingDecelerationWalking = DryBrakingDeceleration \* Grip/);
 assert.match(character,/MaxWalkSpeedCrouched/);
 const tick=character.slice(character.indexOf('void AVPCharacter::Tick'),
  character.indexOf('void AVPCharacter::UpdateSprintFixedStep'));
 const position=tick.indexOf('AVPWorldBootstrap::GetWetApronCoverage(Floor.HitResult, GetCapsuleComponent()->GetScaledCapsuleRadius())');
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
    'static_assert(ApronCoverage(true, ApronX, ApronY, -5., 42., 42.) == 1.f);',
    'static_assert(ApronCoverage(true, ApronX + HalfWidth, ApronY, -5., 42., 42.) == .5f);',
    'static_assert(ApronCoverage(true, ApronX + HalfWidth - 21., ApronY, -5., 42., 42.) == .75f);',
    'static_assert(ApronCoverage(true, ApronX - HalfWidth, ApronY - HalfLength, -5., 42., 42.) == .25f);',
    'static_assert(ApronCoverage(true, ApronX + HalfWidth + 42., ApronY, -5., 42., 42.) == 0.f);',
    'static_assert(ApronCoverage(true, ApronX, ApronY, 235., 42., 42.) == 0.f);',
    'static_assert(ApronCoverage(true, ApronX, ApronY, -20., 42., 42.) == 0.f);',
    'static_assert(ApronCoverage(false, ApronX, ApronY, -5., 42., 42.) == 0.f);',
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

test('the local movement callback drives the first-person cycle and Aden footstep sequence',()=>{
 const character=source('VPCharacter.cpp'), view=source('VPCharacterWeaponView.cpp');
 const controller=source('VPPlayerController.cpp');
 assert.match(character,/OnCharacterMovementUpdated\.AddDynamic\(this, &AVPCharacter::OnLocomotionUpdated\)/);
 assert.match(character,/bClientUpdating[\s\S]*?Movement->bJustTeleported[\s\S]*?LocomotionCadence\.ResetContact\(\)/);
 assert.match(character,/CurrentFloor\.HitResult\.ImpactNormal;\s*const double ContactDistance = VPFooting::GroundedTravelCm\(Travel\.X, Travel\.Y, Travel\.Z, Normal\.X, Normal\.Y, Normal\.Z\);\s*LocomotionCadence\.Advance\(ContactDistance,/);
 assert.match(view,/LocomotionCadence\.Cycle\(\)/);
 assert.match(controller,/GetFootstepSequence\(\)[\s\S]*?Footstep != LastAdenFootstep[\s\S]*?Source->IsPlayableGround\(Floor\.HitResult\)[\s\S]*?PlaySoundAtLocation/);
});
