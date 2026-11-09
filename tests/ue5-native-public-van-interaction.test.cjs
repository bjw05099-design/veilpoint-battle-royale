'use strict';
// Source contract only: actual Unreal C++ compilation, PIE physics and Windows
// visual performance still require the UE5 toolchain and a native playtest.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const dir=path.resolve(__dirname,'../Unreal/Veilpoint/Source/Veilpoint');
const read=n=>fs.readFileSync(path.join(dir,n),'utf8');
const h=read('VPStoryPublicVan.h'),cpp=read('VPStoryPublicVan.cpp'),
 mode=read('VPStoryGameMode.cpp'),controller=read('VPCharacter.cpp'),
 hud=read('VPHUD.cpp'),input=fs.readFileSync(path.resolve(__dirname,'../Unreal/Veilpoint/Config/DefaultInput.ini'),'utf8');
test('one original public vehicle is authored in native CH01, not copied into BR or spawned over map actors',()=>{
 assert.match(mode,/#include "VPStoryPublicVan.h"/);
 assert.match(mode,/TActorIterator<AVPStoryPublicVan>/);
 assert.match(mode,/if\(!bAuthoredVan\)/);
 assert.match(mode,/SpawnActor<AVPStoryPublicVan>/);
 assert.match(mode,/FVector\(2100.f,-1500.f,80.f\)/);
 const start=mode.indexOf('void AVPStoryGameMode::BeginPlay()');
 const end=mode.indexOf('namespace\n{',start);
 assert.ok(start>=0 && mode.indexOf('SpawnActor<AVPStoryPublicVan>',start)<end);
 assert.match(cpp,/PublicStop\(4000.f,-1500.f,80.f\)/);
});
test('native service vehicle is physical, authority-owned and moves on 60Hz collision-swept steps',()=>{
 assert.match(h,/AVPStoryPublicVan : public AActor/);
 assert.match(cpp,/SetReplicateMovement\(true\)/);
 assert.match(cpp,/DOREPLIFETIME\(AVPStoryPublicVan,bParkedAtPublicStop\)/);
 assert.match(cpp,/DOREPLIFETIME\(AVPStoryPublicVan,bYieldingToPedestrian\)/);
 assert.match(cpp,/InitBoxExtent\(FVector\(180.f,85.f,80.f\)\)/);
 assert.match(cpp,/ECC_Pawn,ECR_Block/);
 assert.match(cpp,/ECC_WorldStatic,ECR_Block/);
 assert.match(cpp,/constexpr float StepSeconds=1.f\/60.f/);
 assert.match(cpp,/FixedAccumulator=FMath::Min/);
 assert.match(cpp,/AddActorWorldOffset\(Delta,true,&Hit,ETeleportType::None\)/);
 assert.match(cpp,/if\(Hit.bBlockingHit\) break/);
 assert.match(cpp,/if\(Distance<=6.f\)\{\s*bParkedAtPublicStop=true/);
 assert.doesNotMatch(cpp,/SetActorLocation|ServerMoveTo|TeleportTo|SetCollisionEnabled\(ECollisionEnabled::NoCollision\);\s*SetRootComponent/);
});
test('F requests voluntary near-road yield through the genuine story-only server collision and sight checks',()=>{
 assert.match(input,/ActionName="Interact",Key=F/);
 assert.match(controller,/#include "VPStoryPublicVan.h"/);
 assert.match(controller,/GetGameState<AVPStoryGameState>\(\)/);
 assert.match(controller,/if \(Nearest\) Nearest->TryActivate\(this\);[\s\S]*?NearestVan->TryToggleYield\(this\)/);
 const action=cpp.slice(cpp.indexOf('bool AVPStoryPublicVan::TryToggleYield('),
  cpp.indexOf('void AVPStoryPublicVan::Tick('));
 assert.match(action,/HasAuthority\(\)/);
 assert.match(action,/Requester->IsAlive\(\)/);
 assert.match(action,/StoryStage==EVPStoryStage::RestoreRelay/);
 assert.match(action,/FVector::DistSquared2D/);
 assert.match(action,/FMath::Square\(425.f\)/);
 assert.match(action,/LineTraceTestByChannel/);
 assert.match(action,/ECC_Visibility/);
 assert.match(action,/bYieldingToPedestrian=!bYieldingToPedestrian/);
 assert.doesNotMatch(h,/UFUNCTION\(Server|UFUNCTION\(NetMulticast|UFUNCTION\(Client/);
 const tick=cpp.slice(cpp.indexOf('void AVPStoryPublicVan::Tick('));
 assert.match(tick,/FMath::Square\(600.f\)/);
 assert.match(tick,/bYieldingToPedestrian=false/);
 assert.doesNotMatch(tick,/SetActorLocation|Warp|TeleportTo/);
});
test('PC native HUD observes only a real on-screen unobstructed civic vehicle, not global transport or mission progress',()=>{
 assert.match(hud,/#include "VPStoryPublicVan.h"/);
 const begin=hud.indexOf('for(TActorIterator<AVPStoryPublicVan>');
 const end=hud.indexOf('return;',begin);
 assert.ok(begin>0&&end>begin);
 const text=hud.slice(begin,end);
 assert.match(text,/ToVan.SizeSquared\(\)>FMath::Square\(1800.f\)/);
 assert.match(text,/FVector::DotProduct\(PlayerOwner->GetControlRotation\(\)\.Vector\(\),ToVan\)<=0.f/);
 assert.match(text,/ProjectWorldLocationToScreen/);
 assert.match(text,/LineTraceTestByChannel/);
 assert.match(text,/Van->bParkedAtPublicStop/);
 assert.match(text,/Van->bYieldingToPedestrian/);
 assert.match(text,/F TO REQUEST YIELD/);
 assert.match(text,/F TO RELEASE/);
 assert.doesNotMatch(text,/EVACUATION COMPLETE|ALL CIVILIANS SAFE|SetActorLocation/);
 assert.match(hud,/CH01 PHYSICAL OBJECTIVE IN REACH \| F TO INTERACT/);
});
