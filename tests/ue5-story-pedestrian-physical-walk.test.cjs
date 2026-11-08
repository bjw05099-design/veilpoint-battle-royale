'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../Unreal/Veilpoint/Source/Veilpoint');
const h=fs.readFileSync(path.join(root,'VPStoryPedestrian.h'),'utf8');
const cpp=fs.readFileSync(path.join(root,'VPStoryPedestrian.cpp'),'utf8');
const mode=fs.readFileSync(path.join(root,'VPStoryGameMode.cpp'),'utf8');
const normal=fs.readFileSync(path.join(root,'VPGameMode.cpp'),'utf8');

test('UE5 story pedestrian has actual replicated, solid, collision-swept actor and client-safe 60Hz movement',()=>{
 assert.match(h,/UCLASS\(\)[\s\S]*class VEILPOINT_API AVPStoryPedestrian : public AActor/);
 assert.match(h,/UPROPERTY\(Replicated, BlueprintReadOnly/);
 assert.match(cpp,/bReplicates\s*=\s*true/);
 assert.match(cpp,/SetReplicateMovement\(true\)/);
 assert.match(cpp,/GetLifetimeReplicatedProps/);
 assert.match(cpp,/DOREPLIFETIME\(AVPStoryPedestrian,bReachedSouthCourtyard\)/);
 assert.match(cpp,/InitCapsuleSize\(43\.f,85\.f\)/);
 assert.match(cpp,/SetCollisionResponseToChannel\(ECC_Pawn,ECR_Block\)/);
 assert.match(cpp,/SetCollisionResponseToChannel\(ECC_WorldStatic,ECR_Block\)/);
 assert.match(cpp,/VisibleBody->SetCollisionEnabled\(ECollisionEnabled::NoCollision\)/);
 assert.match(cpp,/if \(!HasAuthority\(\) \|\| bReachedSouthCourtyard/);
 assert.match(cpp,/Story->StoryStage != EVPStoryStage::SouthExit/);
 assert.match(cpp,/constexpr float StepSeconds = 1\.f\/60\.f/);
 assert.match(cpp,/constexpr int32 MaxSteps = 8/);
 assert.match(cpp,/AddActorWorldOffset\(Delta,true,&Hit,ETeleportType::None\)/);
 assert.match(cpp,/if \(Hit\.bBlockingHit\) return/);
 assert.doesNotMatch(cpp,/TeleportTo\(|SetActorLocation\(|SetActorTransform\(|ServerTryTag|ApplyDamage/);
});
test('UE5 CH01 pedestrian is spawned only by native story authority, once per authored map, not BR',()=>{
 assert.match(mode,/if \(!HasAuthority\(\) \|\| !GetWorld\(\)\) return/);
 assert.match(mode,/TActorIterator<AVPStoryPedestrian>/);
 assert.match(mode,/if \(!bAuthoredPedestrian\)/);
 assert.match(mode,/AdjustIfPossibleButDontSpawnIfColliding/);
 assert.match(mode,/SpawnActor<AVPStoryPedestrian>/);
 assert.doesNotMatch(normal,/AVPStoryPedestrian|VPStoryPedestrian/);
 assert.match(mode,/RestoreStoryCheckpoint\(\);/);
 assert.ok(mode.indexOf('SpawnActor<AVPStoryPedestrian>')<mode.indexOf('RestoreStoryCheckpoint();'),
   'a resumed south-route save sees the existing human rather than a spawned mid-path ghost');
});
test('UE5 grounded civilian travel never becomes a fake mission result or save entitlement',()=>{
 assert.match(cpp,/SouthApproachDestination\(4300\.f,-1150\.f,95\.f\)/);
 assert.match(cpp,/constexpr float WalkSpeed=125\.f/);
 assert.doesNotMatch(h+cpp,/TryAdvance\(|PersistStoryCheckpoint\(|SetLifeSpan\(|SetActorHiddenInGame\(/);
 assert.doesNotMatch(mode,/bReachedSouthCourtyard\s*\?\s*EVPStoryStage/);
});
