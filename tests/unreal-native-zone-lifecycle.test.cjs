'use strict';
// Native Unreal source-level contracts: does not simulate UE timers, gameplay
// physics, network packets or prove that a Win64 package compiles.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const src=path.resolve(__dirname,'..','Unreal','Veilpoint','Source','Veilpoint');
const read=name=>fs.readFileSync(path.join(src,name),'utf8');
const zone=read('VPZone.cpp');
const header=read('VPZone.h');
const gameState=read('VPGameState.h');
const gameMode=read('VPGameMode.cpp');

test('UE5 zone samples authoritative world time at native round start',()=>{
 assert.match(zone,/void AVPZone::BeginPlay\(\)[\s\S]*?if \(HasAuthority\(\) && GetWorld\(\)\)/);
 assert.match(zone,/StartServerTimeSeconds=GetWorld\(\)->GetTimeSeconds\(\)/);
 assert.match(zone,/GetWorldTimerManager\(\)\.SetTimer\(ZoneTimer,this,&AVPZone::UpdateZone,\.25f,true\)/);
 assert.match(header,/float StartServerTimeSeconds = 0\.f;/);
 assert.doesNotMatch(header,/TotalElapsed/);
});

test('UE5 safe-zone duration follows elapsed server game time, not count of timer callbacks',()=>{
 const update=zone.slice(zone.indexOf('void AVPZone::UpdateZone()'),zone.indexOf('void AVPZone::GetLifetimeReplicatedProps('));
 assert.match(update,/float time=FMath::Max\(0\.f,GetWorld\(\)->GetTimeSeconds\(\)-StartServerTimeSeconds\)/);
 assert.doesNotMatch(update,/TotalElapsed\s*\+\s*=|TotalElapsed\+\+/);
 assert.match(update,/for\(;nextPhase<5;nextPhase\+\+\)/);
 assert.match(update,/time-=Durations\[nextPhase\]/);
 assert.match(update,/FMath::Clamp\(time\/Durations\[Phase\],0\.f,1\.f\)/);
});

test('UE5 completed round clears server zone timer before time, radius or effects change',()=>{
 const update=zone.slice(zone.indexOf('void AVPZone::UpdateZone()'),zone.indexOf('void AVPZone::GetLifetimeReplicatedProps('));
 assert.match(update,/if \(!HasAuthority\(\) \|\| !GetWorld\(\)\) return/);
 assert.match(zone,/#include "VPGameState.h"/);
 assert.match(update,/GetWorld\(\)->GetGameState<AVPGameState>\(\)/);
 const completed=update.indexOf('if (Match->bRoundComplete)');
 const stop=update.indexOf('ClearTimer(ZoneTimer)',completed);
 const elapsed=update.indexOf('float time=FMath::Max(');
 const effects=update.indexOf('UGameplayStatics::ApplyDamage(');
 assert.ok(completed>=0 && stop>completed && stop<elapsed && effects>elapsed);
 assert.match(update.slice(completed,elapsed),/ClearTimer\(ZoneTimer\);[\s\S]*?ForceNetUpdate\(\);[\s\S]*?return;/);
 assert.doesNotMatch(update.slice(0,elapsed),/ApplyDamage/);
});

test('UE5 replicated round completion is exclusively published by game mode',()=>{
 assert.match(gameState,/UPROPERTY\(Replicated, BlueprintReadOnly, Category="VEILPOINT\|Round"\)[\s\S]*?bool bRoundComplete = false;/);
 assert.match(gameMode,/if\(bSeenMultiplePlayers&&Living<=1\)\{bRoundComplete=true;/);
 assert.match(gameMode,/NativeState->UpdateRoundState\(Living,bRoundComplete\)/);
 assert.doesNotMatch(zone,/Match->bRoundComplete\s*=/);
 assert.match(zone,/DOREPLIFETIME\(AVPZone,Remaining\)/);
 assert.match(zone,/DOREPLIFETIME\(AVPZone,Radius\)/);
});

test('UE5 safe-zone finite phases and radius table preserve client-visible limits',()=>{
 assert.match(zone,/constexpr float Durations\[6\] = \{90\.f, 95\.f, 90\.f, 85\.f, 70\.f, 999\.f\}/);
 assert.match(zone,/constexpr float Radii\[7\] = \{17500\.f, 13500\.f, 9600\.f, 6200\.f, 3300\.f, 1200\.f, 150\.f\}/);
 assert.match(zone,/Remaining=FMath::Max\(0\.f,Durations\[Phase\]-time\)/);
 assert.match(zone,/Radius=FMath::Lerp\(Radii\[Phase\],Radii\[Phase\+1\]/);
 assert.match(zone,/if\(!P->IsAlive\(\)\) continue/);
});
