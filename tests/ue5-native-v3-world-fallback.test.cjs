'use strict';
// Source contract only. Actual UE5 native compile, SaveGame disk I/O and
// collision recovery must be verified later in Unreal Editor on Windows.
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../Unreal/Veilpoint/Source/Veilpoint');
const mode=fs.readFileSync(path.join(root,'VPStoryGameMode.cpp'),'utf8');
const pedestrian=fs.readFileSync(path.join(root,'VPStoryPedestrian.cpp'),'utf8');

test('native v3 cannot restore mission progress while a claimed civilian pose fails physical recovery',()=>{
 const start=mode.indexOf('bool RestoreVerifiedCivilianPose(');
 const end=mode.indexOf('void AVPStoryGameMode::RestoreStoryCheckpoint()',start);
 assert.ok(start>0&&end>start);
 const restore=mode.slice(start,end);
 assert.match(restore,/if \(!World \|\| !Saved\) return false/);
 assert.match(restore,/Saved->SchemaVersion != 3 \|\| !Saved->bHasCivilianPose\) return true/);
 assert.match(restore,/if \(It->RestorePhysicalCheckpoint\(/);
 assert.match(restore,/bSavedCivilianAtSouthCourtyard\)\) return true/);
 assert.match(restore,/trying previous checkpoint/);
 assert.match(restore,/return false/);
 const progress=mode.slice(end,mode.indexOf('bool AVPStoryGameMode::PersistStoryCheckpoint()',end));
 assert.match(progress,/Primary && RestoreVerifiedCivilianPose\(GetWorld\(\), Primary\) &&\s*State->RestoreProgress\(/);
 assert.match(progress,/Backup && RestoreVerifiedCivilianPose\(GetWorld\(\), Backup\) &&\s*State->RestoreProgress\(/);
 assert.ok(progress.indexOf('RestoreVerifiedCivilianPose(GetWorld(), Primary)')<
           progress.indexOf('State->RestoreProgress('),'physical world must be reconstructed before accepting saved mission');
 assert.match(progress,/ReadVerifiedCheckpoint\(CH01BackupSlot\)/);
});

test('pedestrian v3 position reconstruction is local-only and never affects live 60Hz movement',()=>{
 const start=pedestrian.indexOf('bool AVPStoryPedestrian::RestorePhysicalCheckpoint(');
 const restore=pedestrian.slice(start);
 assert.ok(start>0);
 assert.match(restore,/!HasAuthority\(\)/);
 assert.match(restore,/GetWorld\(\)->GetNetMode\(\)!=NM_Standalone/);
 assert.match(restore,/!IsCoherentCheckpointPose\(Location,bSidewalk,bCourtyard\)/);
 assert.match(restore,/SetActorLocation\(SidewalkDestination,true,&Hit,ETeleportType::None\)/);
 assert.match(restore,/SetActorLocation\(Location,true,&Hit,ETeleportType::None\)/);
 assert.match(restore,/if \(!bPlaced\)[\s\S]*?SetActorLocation\(Before,false,nullptr,ETeleportType::TeleportPhysics\)/);
 const live=pedestrian.slice(pedestrian.indexOf('void AVPStoryPedestrian::Tick'),
   pedestrian.indexOf('bool AVPStoryPedestrian::IsCoherentCheckpointPose'));
 assert.match(live,/AddActorWorldOffset\(Delta,true,&Hit,ETeleportType::None\)/);
 assert.doesNotMatch(live,/SetActorLocation|RestorePhysicalCheckpoint/);
});