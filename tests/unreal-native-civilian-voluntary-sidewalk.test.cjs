'use strict';
// Source-level contract only. Native actor movement and HUD still require UE5
// editor/PIE plus a real Windows GPU before being called fully playable.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const dir=path.resolve(__dirname,'../Unreal/Veilpoint/Source/Veilpoint');
const read=file=>fs.readFileSync(path.join(dir,file),'utf8');
const cpp=read('VPStoryPedestrian.cpp'),header=read('VPStoryPedestrian.h'),hud=read('VPHUD.cpp');

test('UE5 autonomous pedestrian exits exposed path after conflict without waiting for captain route',()=>{
 assert.match(header,/bool bMovedToSidewalk = false;/);
 assert.match(header,/UPROPERTY\(Replicated, BlueprintReadOnly, Category="VEILPOINT\|CH01\|Civilian"\)\s*bool bMovedToSidewalk/);
 assert.match(cpp,/DOREPLIFETIME\(AVPStoryPedestrian,bMovedToSidewalk\)/);
 assert.match(cpp,/if \(!HasAuthority\(\) \|\| bReachedSouthCourtyard \|\| !GetWorld\(\)\) return;/);
 assert.match(cpp,/Story->StoryStage == EVPStoryStage::RestoreRelay/);
 assert.match(cpp,/Story->StoryStage == EVPStoryStage::Complete/);
 assert.match(cpp,/WalkToward\(SidewalkDestination,StepSeconds\)/);
 const tick=cpp.slice(cpp.indexOf('void AVPStoryPedestrian::Tick'),cpp.indexOf('bool AVPStoryPedestrian::WalkToward'));
 assert.match(tick,/bMovedToSidewalk=true/);
 assert.match(tick,/Story->StoryStage == EVPStoryStage::SouthExit/);
 assert.match(tick,/else if \(Story->StoryStage == EVPStoryStage::SouthExit\)\{\s*AdvancePedestrian\(StepSeconds\)/);
 assert.doesNotMatch(tick,/TryAdvance|ServerTry|GetAllActorsOfClass|SetActorLocation/);
});
test('public sidewalk and south courtyard remain separate physical 60Hz collision-bounded milestones',()=>{
 const matchA=cpp.match(/SidewalkDestination\(([-\d.]+)f,([-\d.]+)f,([-\d.]+)f\)/);
 const matchB=cpp.match(/SouthApproachDestination\(([-\d.]+)f,([-\d.]+)f,([-\d.]+)f\)/);
 assert.ok(matchA&&matchB);
 assert.notDeepEqual(matchA.slice(1),matchB.slice(1));
 assert.match(cpp,/constexpr float StepSeconds = 1\.f\/60\.f/);
 assert.match(cpp,/constexpr float WalkSpeed=125\.f/);
 assert.match(cpp,/AddActorWorldOffset\(Delta,true,&Hit,ETeleportType::None\)/);
 assert.match(cpp,/if \(Hit.bBlockingHit\) return false/);
 assert.match(cpp,/FVector::Dist2D\(GetActorLocation\(\),Destination\)<=4\.f/);
 assert.match(cpp,/bReachedSouthCourtyard=true;\s*ForceNetUpdate\(\)/);
 assert.doesNotMatch(cpp,/bMovedToSidewalk=true;[^}]*bReachedSouthCourtyard=true/s);
});
test('native viewport reports only the visibly observed resident, never global rescue completion',()=>{
 const start=hud.indexOf('for (TActorIterator<AVPStoryPedestrian> It(World)'),end=hud.indexOf('        return;',start);
 assert.ok(start>0&&end>start);
 const visible=hud.slice(start,end);
 assert.match(visible,/Person->bMovedToSidewalk/);
 assert.match(visible,/STOPPED AT NEARBY PUBLIC WALKWAY/);
 assert.match(visible,/WALKED TO THE SOUTH PUBLIC COURT/);
 assert.match(visible,/ProjectWorldLocationToScreen/);
 assert.match(visible,/LineTraceTestByChannel/);
 assert.doesNotMatch(visible,/all residents evacuated|EVERYONE SAFE|ServerTry/);
});
