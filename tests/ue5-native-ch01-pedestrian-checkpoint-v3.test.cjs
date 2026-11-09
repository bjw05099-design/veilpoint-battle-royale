'use strict';
// UE5 native C++ integration contract. Windows UE editor/UBT/PIE is NOT
// available in this Node CI; the test never claims native playback verified.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../Unreal/Veilpoint/Source/Veilpoint');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const save=read('VPStoryCheckpoint.h'),mode=read('VPStoryGameMode.cpp');
const actor=read('VPStoryPedestrian.cpp'),header=read('VPStoryPedestrian.h');

test('version-three native civilian state adds durable fields but keeps original objective slots and legacy formats',()=>{
 assert.match(save,/SchemaVersion = 3/);
 for(const field of ['SavedStage','bSavedHarborRecord','bSavedShelterRecord','bSavedBeaconActivated',
   'bHasCivilianPose','SavedCivilianPosition','bSavedCivilianAtSidewalk','bSavedCivilianAtSouthCourtyard']){
   assert.match(save,new RegExp('UPROPERTY\\(SaveGame\\)[\\s\\S]*?\\b'+field+'\\b'));
 }
 assert.match(mode,/SchemaVersion != 1 && Saved->SchemaVersion != 2 && Saved->SchemaVersion != 3/);
 assert.match(mode,/Saved->SchemaVersion >= 2 && Saved->bSavedBeaconActivated/);
 assert.match(mode,/const FString CH01Slot = TEXT\("veilpoint\.ch01\.native\.v1"\)/);
 assert.match(mode,/const FString CH01BackupSlot = TEXT\("veilpoint\.ch01\.native\.v1\.backup"\)/);
 assert.doesNotMatch(save,/SavedPlayerTransform|SavedAmmo|SavedHealth|PrivateToken|OpposingSquad/);
});
test('only physically arrived civilian milestones commit the native checkpoint',()=>{
 const tick=actor.slice(actor.indexOf('void AVPStoryPedestrian::Tick'),actor.indexOf('bool AVPStoryPedestrian::WalkToward'));
 const advance=actor.slice(actor.indexOf('void AVPStoryPedestrian::AdvancePedestrian'),actor.indexOf('bool AVPStoryPedestrian::IsCoherentCheckpointPose'));
 assert.match(tick,/if \(!HasAuthority\(\) \|\| bReachedSouthCourtyard \|\| !GetWorld\(\)\) return/);
 assert.match(tick,/constexpr float StepSeconds = 1\.f\/60\.f/);
 assert.match(tick,/if \(WalkToward\(SidewalkDestination,StepSeconds\)\)\s*\{\s*bMovedToSidewalk=true;/);
 assert.match(tick,/bMovedToSidewalk=true;[\s\S]*?Mode->PersistStoryCheckpoint\(\)/);
 assert.match(advance,/if \(WalkToward\(SouthApproachDestination,FixedSeconds\)\)\s*\{\s*bReachedSouthCourtyard=true;/);
 assert.match(advance,/bReachedSouthCourtyard=true;[\s\S]*?Mode->PersistStoryCheckpoint\(\)/);
 assert.doesNotMatch(tick,/SetActorLocation|TryAdvance|ServerRPC/);
 assert.match(mode,/GetWorld\(\)->GetNetMode\(\) != NM_Standalone/);
});
test('saved pedestrian pose is validated against two 60Hz sidewalk legs before any recovery movement',()=>{
 assert.match(header,/static bool IsCoherentCheckpointPose\(const FVector& Location, bool bSidewalk, bool bCourtyard\)/);
 assert.match(header,/bool RestorePhysicalCheckpoint\(const FVector& Location, bool bSidewalk, bool bCourtyard\)/);
 assert.match(actor,/PreviewCivilianStart\(3400\.f,-800\.f,80\.f\)/);
 assert.match(actor,/SidewalkDestination\(3850\.f,-800\.f,80\.f\)/);
 assert.match(actor,/SouthApproachDestination\(4300\.f,-1150\.f,80\.f\)/);
 assert.match(actor,/bCourtyard && !bSidewalk/);
 assert.match(actor,/Location\.ContainsNaN\(\)/);
 assert.match(actor,/Progress<-\.001f \|\| Progress>1\.001f/);
 assert.match(actor,/FVector::Dist\(Location,Closest\)<=5\.f/);
 assert.match(actor,/FVector::Dist2D\(Location,SouthApproachDestination\)<=4\.f/);
 const restore=actor.slice(actor.indexOf('bool AVPStoryPedestrian::RestorePhysicalCheckpoint'));
 assert.match(restore,/!HasAuthority\(\) \|\| !GetWorld\(\)/);
 assert.ok(restore.indexOf('!IsCoherentCheckpointPose(')<restore.indexOf('SetActorLocation('));
 assert.match(restore,/SetActorLocation\(SidewalkDestination,true,&Hit,ETeleportType::None\)/);
 assert.match(restore,/SetActorLocation\(Location,true,&Hit,ETeleportType::None\)/);
 assert.match(restore,/if \(!bPlaced\)[\s\S]*?return false;/);
 assert.match(restore,/bMovedToSidewalk=bSidewalk;[\s\S]*?bReachedSouthCourtyard=bCourtyard/);
});
test('native save and restore carry the same authentic pedestrian pose without making paper tasks mandatory',()=>{
 const coherent=mode.slice(mode.indexOf('bool IsCoherentSaved('),mode.indexOf('UVPStoryCheckpoint* ReadVerifiedCheckpoint'));
 assert.match(coherent,/Saved->SchemaVersion == 3/);
 assert.match(coherent,/AVPStoryPedestrian::IsCoherentCheckpointPose/);
 assert.match(coherent,/Saved->SavedStage == EVPStoryStage::RestoreRelay/);
 assert.match(coherent,/else if \(Saved->bSavedCivilianAtSidewalk/);
 const restoration=mode.slice(mode.indexOf('void AVPStoryGameMode::RestoreStoryCheckpoint()'),mode.indexOf('bool AVPStoryGameMode::PersistStoryCheckpoint()'));
 assert.match(restoration,/RestoreVerifiedCivilianPose\(GetWorld\(\), Primary\)/);
 assert.match(restoration,/RestoreVerifiedCivilianPose\(GetWorld\(\), Backup\)/);
 assert.match(restoration,/Primary->SchemaVersion >= 2/);
 assert.match(restoration,/Backup->SchemaVersion >= 2/);
 const write=mode.slice(mode.indexOf('bool AVPStoryGameMode::PersistStoryCheckpoint()'));
 assert.match(write,/Saved->SchemaVersion = 3/);
 assert.match(write,/Saved->SavedCivilianPosition = Observed/);
 assert.match(write,/Saved->bSavedCivilianAtSidewalk = It->bMovedToSidewalk/);
 assert.match(write,/Saved->bSavedCivilianAtSouthCourtyard = It->bReachedSouthCourtyard/);
 assert.match(write,/Check->SavedCivilianPosition\.Equals\(Saved->SavedCivilianPosition,\.01f\)/);
 assert.match(write,/Check->bSavedCivilianAtSouthCourtyard == Saved->bSavedCivilianAtSouthCourtyard/);
 assert.ok(write.indexOf('SaveGameToSlot(\n        Previous, CH01BackupSlot')<write.indexOf('SaveGameToSlot(Saved, CH01Slot'));
 assert.doesNotMatch(write,/SetActorLocation|bReachedSouthCourtyard=true/);
});
