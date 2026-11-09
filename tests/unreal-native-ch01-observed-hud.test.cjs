'use strict';
// This is a source-level Unreal C++ contract, not editor/PIE compilation.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const base=path.resolve(__dirname,'../Unreal/Veilpoint/Source/Veilpoint');
const h=fs.readFileSync(path.join(base,'VPHUD.h'),'utf8');
const hud=fs.readFileSync(path.join(base,'VPHUD.cpp'),'utf8');
const marker=fs.readFileSync(path.join(base,'VPStoryMarker.cpp'),'utf8');
test('native CH01 HUD draws only physically available and directly observable story targets',()=>{
 const begin=hud.indexOf('GetGameState<AVPStoryGameState>()');
 const end=hud.indexOf('// Finite supplies stay visible',begin);
 const story=hud.slice(begin,end);
 assert.ok(begin>0&&end>begin);
 assert.match(story,/TActorIterator<AVPStoryMarker>/);
 assert.match(story,/Target->IsAvailable\(\)/);
 assert.match(story,/FVector::DistSquared\(Position, Target->GetActorLocation\(\)\)/);
 assert.match(story,/LineTraceTestByChannel\(Eye, Target->GetActorLocation\(\),\s*ECC_Visibility, Query\)/);
 assert.match(story,/Query.AddIgnoredActor\(Target\)/);
 assert.match(story,/if \(NearestVisible\)/);
 assert.doesNotMatch(story,/HiddenEnemy|GetAllActorsOfClass|UE_LOG.*OBJECTIVE REACH/);
 assert.match(marker,/return !bUsed && State && State->IsAvailable\(Action\)/);
});
test('native objective HUD uses real 25m local range and 2.75m F reach in world centimetres',()=>{
 assert.match(hud,/NearestVisibleSq = FMath::Square\(2500\.f\)/);
 assert.match(hud,/NearestVisibleSq <= FMath::Square\(275\.f\)/);
 assert.match(hud,/const float Metres = FMath::Sqrt\(NearestVisibleSq\) \/ 100\.f/);
 assert.match(hud,/CH01 PHYSICAL OBJECTIVE IN REACH \| F TO INTERACT/);
 assert.match(hud,/CH01 VISIBLE OBJECTIVE %.1fm \| APPROACH TO INTERACT/);
 assert.match(marker,/FMath::Square\(275\.f\)/);
});
test('native objective scan is bounded independently of 165Hz render and safely resets after world travel',()=>{
 assert.match(h,/#include "VPFrameTelemetry.h"/);
 assert.match(h,/TWeakObjectPtr<UWorld> ObservedStoryWorld/);
 assert.match(h,/TArray<TWeakObjectPtr<AVPStoryMarker>> ObservedStoryMarkers/);
 assert.match(h,/double NextObjectiveScanAt = 0\.0/);
 const begin=hud.indexOf('if (ObservedStoryWorld.Get() != World)');
 const end=hud.indexOf('const FVector Eye = Pawn->GetPawnViewLocation()',begin);
 const scan=hud.slice(begin,end);
 assert.match(scan,/ObservedStoryMarkers\.Reset\(\)/);
 assert.match(scan,/Now >= NextObjectiveScanAt/);
 assert.match(scan,/NextObjectiveScanAt = Now \+ \.5/);
 assert.match(scan,/ObservedStoryMarkers.Add\(\*It\)/);
 assert.match(hud,/const AVPStoryMarker\* Target = Item.Get\(\)/);
 assert.match(hud,/!IsValid\(Target\)/);
});
test('native CH01 indication stays separate from BR-only supplies and round timer',()=>{
 const story=hud.indexOf('GetGameState<AVPStoryGameState>()');
 const indication=hud.indexOf('CH01 PHYSICAL OBJECTIVE IN REACH');
 const supplies=hud.indexOf('const FString SupplyLabel');
 const zone=hud.indexOf('const FString ZoneLabel');
 assert.ok(story>=0&&indication>story&&supplies>indication&&zone>supplies);
 assert.match(hud.slice(indication,supplies),/return;/);
});


test('native CH01 explicitly excludes behind-camera and offscreen targets even with a clear ray',()=>{
 const begin=hud.indexOf('const FVector Eye = Pawn->GetPawnViewLocation()');
 const end=hud.indexOf('if (NearestVisible)',begin);
 const code=hud.slice(begin,end);
 assert.match(code,/FVector::DotProduct\(PlayerOwner->GetControlRotation\(\)\.Vector\(\), ToTarget\) <= 0\.f/);
 assert.match(code,/PlayerOwner->ProjectWorldLocationToScreen\(/);
 assert.match(code,/Target->GetActorLocation\(\),Screen,false/);
 assert.match(code,/FMath::IsFinite\(Screen.X\)/);
 assert.match(code,/FMath::IsFinite\(Screen.Y\)/);
 assert.match(code,/Screen.X < 0\.f \|\| Screen.Y < 0\.f/);
 assert.match(code,/Screen.X >= Canvas->ClipX \|\| Screen.Y >= Canvas->ClipY/);
 assert.ok(code.indexOf('ProjectWorldLocationToScreen') < code.indexOf('LineTraceTestByChannel'),
  'do not burn a ray cast on target excluded by camera projection');
 assert.ok(code.indexOf('NearestVisible = Target') > code.indexOf('LineTraceTestByChannel'),
  'only a projected, unobstructed active actor counts as locally visible');
});
