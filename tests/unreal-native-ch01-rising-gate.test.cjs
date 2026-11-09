'use strict';
// Offline source-contract check only. UE5 UHT, physics PIE and a real Windows
// native build must separately be run; browser-host CI cannot certify them.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../Unreal/Veilpoint/Source/Veilpoint');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const gateH=read('VPStoryEastGate.h'),gate=read('VPStoryEastGate.cpp');
const mode=read('VPStoryGameMode.cpp'),state=read('VPStoryGameState.cpp');
const world=read('VPWorldBootstrap.cpp'),hud=read('VPHUD.cpp'),hudH=read('VPHUD.h');
const save=read('VPStoryCheckpoint.h');

test('UE5 native public gate is a real colliding replicated actor, not a HUD timer',()=>{
 assert.match(gateH,/class VEILPOINT_API AVPStoryEastGate : public AActor/);
 assert.match(gateH,/TObjectPtr<UStaticMeshComponent> Door/);
 assert.match(gate,/SetCollisionProfileName\(TEXT\("BlockAll"\)\)/);
 assert.match(gate,/SetReplicateMovement\(true\)/);
 assert.match(gate,/DOREPLIFETIME\(AVPStoryEastGate,ClosedZ\)/);
 assert.match(gate,/if\(!HasAuthority\(\)\|\|!GetWorld\(\)\)return/);
 assert.match(gate,/StepAccumulator=.*DeltaSeconds/);
 assert.match(gate,/constexpr float FixedStep=1\.f\/60\.f/);
 assert.match(gate,/SetActorLocation\(FVector\(Now\.X,Now\.Y,Next\),true,&Hit,ETeleportType::None\)/);
 assert.match(gate,/if\(Hit\.IsValidBlockingHit\(\)\)break/);
 assert.ok(gate.indexOf('StoryStage!=EVPStoryStage::EastExit')<
   gate.indexOf('SetActorLocation('),'door does not open before real route request');
 assert.doesNotMatch(gate,/Destroy\(|TeleportTo\(|SetActorEnableCollision\(false\)/);
});
test('new gate is located only in CH01 and physically framed between fictionally authored public walls',()=>{
 assert.match(mode,/#include "VPStoryEastGate.h"/);
 assert.match(mode,/TActorIterator<AVPStoryEastGate>/);
 assert.match(mode,/if\(!bHasEastGate\)[\s\S]*?SpawnActor<AVPStoryEastGate>/);
 assert.match(mode,/FVector\(4050\.f,1400\.f,150\.f\)/);
 assert.match(world,/FVector\(4050\.f,600\.f,145\.f\), FVector\(\.4f,10\.f,2\.9f\)/);
 assert.match(world,/FVector\(4050\.f,2200\.f,145\.f\), FVector\(\.4f,10\.f,2\.9f\)/);
 const southWallMax=600+10*100/2, northWallMin=2200-10*100/2;
 const gateLow=1400-4.8*100/2,gateHigh=1400+4.8*100/2;
 assert.equal(northWallMin-southWallMax,600);
 assert.ok(gateLow-southWallMax<85&&northWallMin-gateHigh<85,
   'closed shutter has no phantom player-capsule-sized bypass');
 const nativeGateMode=mode.slice(mode.indexOf('void AVPStoryGameMode::BeginPlay()'),mode.indexOf('namespace'));
 assert.doesNotMatch(nativeGateMode,/SpawnActor<AVPStoryEastGate>[\s\S]*?AVPGameMode::BeginPlay/);
});
test('native east exit waits on the genuine server gate without papers, extra save flags or local cheats',()=>{
 const available=state.slice(state.indexOf('bool AVPStoryGameState::IsAvailable('),
   state.indexOf('bool AVPStoryGameState::TryAdvance('));
 assert.match(available,/case EVPStoryStage::EastExit:[\s\S]*?Action!=EVPStoryAction::ReachEast/);
 assert.match(available,/TActorIterator<AVPStoryEastGate>/);
 assert.match(available,/GetOpeningFraction\(\)>=\.999f/);
 assert.doesNotMatch(available,/bReadHarbor && bReadShelter/);
 assert.match(hud,/Gate->GetOpeningFraction\(\)/);
 assert.match(hud,/EAST PUBLIC GATE \| PHYSICAL CLEARANCE/);
 assert.match(hudH,/TWeakObjectPtr<AVPStoryEastGate> CachedEastGate/);
 assert.doesNotMatch(save,/EastGateProgress|bGateCleared|GateOpenTime/,
  'native v1/v2 objective save remains untouched');
 const browser=fs.readFileSync(path.resolve(__dirname,'../src/story-slice.js'),'utf8');
 assert.match(browser,/gateReadyAt/);
 assert.match(browser,/eastLocalRequest/);
});
