'use strict';
// UE5 source-contract tests. Only Unreal Editor/Windows can validate the
// engine's real SaveGame I/O and scene collision checks at runtime.
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const dir=path.resolve(__dirname,'../Unreal/Veilpoint/Source/Veilpoint');
const read=name=>fs.readFileSync(path.join(dir,name),'utf8');
const header=read('VPStoryCheckpoint.h'),mode=read('VPStoryGameMode.cpp');
const pedestrian=read('VPStoryPedestrian.cpp'),pedestrianH=read('VPStoryPedestrian.h');

test('native V3 saves record actual civilian pose and preserve V1/V2 compatibility',()=>{
 assert.match(header,/SchemaVersion = 3/);
 for(const field of ['bHasPedestrianPose','SavedPedestrianPosition','bSavedPedestrianOnSidewalk','bSavedPedestrianReachedSouth'])
  assert.match(header,new RegExp('UPROPERTY\\(SaveGame\\)[\\s\\S]*?\\b'+field+'\\b'));
 assert.match(mode,/Saved->SchemaVersion != 1 && Saved->SchemaVersion != 2 &&[\s\S]*?Saved->SchemaVersion != 3/);
 assert.match(mode,/Saved->SchemaVersion >= 2 && Saved->bSavedBeaconActivated/);
 assert.match(mode,/Primary->SchemaVersion >= 2 && Primary->bSavedBeaconActivated/);
 assert.match(mode,/Backup->SchemaVersion >= 2 && Backup->bSavedBeaconActivated/);
 assert.match(mode,/Saved->SchemaVersion = 3/);
 assert.match(mode,/Saved->SavedPedestrianPosition = Position/);
 assert.match(mode,/Check->SavedPedestrianPosition\.Equals\(Saved->SavedPedestrianPosition,\.01f\)/);
 assert.match(mode,/ReadVerifiedCheckpoint\(CH01BackupSlot\)/);
 assert.match(mode,/if \(Primary && RestoreCivilian\(Primary\) && State->RestoreProgress\(/);
 assert.match(mode,/if \(Backup && RestoreCivilian\(Backup\) && State->RestoreProgress\(/);
 assert.match(mode,/civilian checkpoint pose blocked; trying verified backup/);
});

test('pedestrian pose is finite and load-only reconstitution cannot bypass 60Hz walking',()=>{
 const validate=pedestrian.slice(pedestrian.indexOf('bool AVPStoryPedestrian::IsCoherentCheckpointPose'),
  pedestrian.indexOf('bool AVPStoryPedestrian::RestoreOfflineCheckpointPose'));
 assert.match(validate,/FMath::IsFinite\(Position\.X\)/);
 assert.match(validate,/FMath::IsFinite\(Position\.Y\)/);
 assert.match(validate,/FMath::IsFinite\(Position\.Z\)/);
 assert.match(validate,/Position\.X < 3396\.f/);
 assert.match(validate,/Position\.X > 4304\.f/);
 assert.match(validate,/Position\.X<=3850\.f/);
 assert.match(validate,/bSouth && !bSidewalk/);
 assert.match(validate,/FVector::Dist2D\(Position,SouthApproachDestination\)>4\.f/);
 const restore=pedestrian.slice(pedestrian.indexOf('bool AVPStoryPedestrian::RestoreOfflineCheckpointPose'),
  pedestrian.indexOf('AVPStoryPedestrian::AVPStoryPedestrian()'));
 assert.match(restore,/!HasAuthority\(\)/);
 assert.match(restore,/GetNetMode\(\)!=NM_Standalone/);
 assert.match(restore,/OverlapBlockingTestByChannel/);
 assert.match(restore,/SetActorLocation\(Position,false,nullptr,ETeleportType::TeleportPhysics\)/);
 assert.match(restore,/FixedAccumulator=0\.f/);
 assert.match(restore,/ForceNetUpdate\(\)/);
 const runtime=pedestrian.slice(pedestrian.indexOf('void AVPStoryPedestrian::Tick'));
 assert.match(runtime,/AddActorWorldOffset\(Delta,true,&Hit,ETeleportType::None\)/);
 assert.doesNotMatch(runtime,/SetActorLocation\(|TeleportTo\(|SetActorTransform\(/);
 assert.doesNotMatch(pedestrianH,/ServerTryAdvance|RemoteProcedureCall|NetMulticast/);
});

test('real fixed-tick sidewalk and courtyard arrivals checkpoint without inventing rescue completion',()=>{
 const code=pedestrian.slice(pedestrian.indexOf('void AVPStoryPedestrian::Tick'));
 assert.match(code,/if \(WalkToward\(SidewalkDestination,StepSeconds\)\)/);
 assert.match(code,/bMovedToSidewalk=true;[\s\S]*?Mode->PersistStoryCheckpoint\(\)/);
 assert.match(code,/if \(WalkToward\(SouthApproachDestination,FixedSeconds\)\)/);
 assert.match(code,/bReachedSouthCourtyard=true;[\s\S]*?Mode->PersistStoryCheckpoint\(\)/);
 assert.match(mode,/It->GetActorLocation\(\)/);
 assert.match(mode,/Saved->bSavedPedestrianReachedSouth = It->bReachedSouthCourtyard/);
 const spawn=mode.indexOf('SpawnActor<AVPStoryPedestrian>'),load=mode.indexOf('RestoreStoryCheckpoint();');
 assert.ok(spawn>0&&load>spawn);
 assert.match(mode,/It->RestoreOfflineCheckpointPose\(/);
 assert.doesNotMatch(mode,/bSavedPedestrianReachedSouth\s*\?\s*EVPStoryStage::Complete/);
});