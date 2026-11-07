'use strict';
// Source-level checks only: neither UBT compilation nor actual PIE is executed.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const base=path.resolve(__dirname,'../Unreal/Veilpoint/Source/Veilpoint');
const read=name=>fs.readFileSync(path.join(base,name),'utf8');
const mode=read('VPStoryGameMode.cpp');
const modeH=read('VPStoryGameMode.h');
const state=read('VPStoryGameState.cpp');
const stateH=read('VPStoryGameState.h');
const marker=read('VPStoryMarker.cpp');
const markerH=read('VPStoryMarker.h');
const character=read('VPCharacter.cpp');
const hud=read('VPHUD.cpp');
const world=read('VPWorldBootstrap.cpp');

test('UE5 CH01 gets a dedicated selectable game mode without changing the default BR mode',()=>{
 assert.match(modeH,/class VEILPOINT_API AVPStoryGameMode : public AVPGameMode/);
 assert.match(mode,/GameStateClass = AVPStoryGameState::StaticClass\(\)/);
 assert.match(mode,/PrimaryActorTick\.bCanEverTick = false/);
 assert.match(mode,/AGameModeBase::BeginPlay\(\)/);
 assert.doesNotMatch(mode,/SpawnActor<AVPZone>/);
 const ini=fs.readFileSync(path.resolve(base,'../../Config/DefaultEngine.ini'),'utf8');
 assert.match(ini,/GlobalDefaultGameMode=\/Script\/Veilpoint\.VPGameMode/);
 assert.match(ini,/GameDefaultMap=\/Engine\/Maps\/Entry/);
});

test('UE5 CH01 physically creates seven non-combat objective markers on an authoritative local world',()=>{
 assert.match(mode,/if \(!HasAuthority\(\) \|\| !GetWorld\(\)\) return/);
 assert.match(mode,/SpawnActor<AVPStoryWorldBootstrap>/);
 const actions=['RestoreRelay','ReadHarbor','ReadShelter','ChooseSouth','ChooseEast','ReachSouth','ReachEast'];
 for(const action of actions){
  assert.match(mode,new RegExp('EVPStoryAction::'+action+', FVector\\('));
  assert.match(stateH,new RegExp('\\b'+action+'\\b'));
 }
 assert.match(mode,/SpawnActor<AVPStoryMarker>/);
 assert.match(mode,/Marker->Action = Placement\.Action/);
 assert.match(marker,/SetCollisionEnabled\(ECollisionEnabled::NoCollision\)/);
 assert.match(marker,/SetReplicateMovement\(false\)/);
});

test('UE5 story phases and discovered records replicate only from authoritative physical markers',()=>{
 assert.match(stateH,/enum class EVPStoryStage : uint8/);
 assert.match(stateH,/UPROPERTY\(Replicated, BlueprintReadOnly, Category="VEILPOINT\|CH01"\)/);
 for(const name of ['StoryStage','bReadHarbor','bReadShelter'])
  assert.match(state,new RegExp('DOREPLIFETIME\\(AVPStoryGameState, '+name+'\\)'));
 assert.match(state,/if \(!HasAuthority\(\) \|\| !IsAvailable\(Action\)\) return false/);
 assert.match(state,/if \(bReadShelter\) StoryStage = EVPStoryStage::ChooseRoute/);
 assert.match(state,/if \(bReadHarbor\) StoryStage = EVPStoryStage::ChooseRoute/);
 assert.match(state,/StoryStage = EVPStoryStage::SouthExit/);
 assert.match(state,/StoryStage = EVPStoryStage::EastExit/);
 assert.match(state,/StoryStage = EVPStoryStage::Complete/);
 assert.match(state,/ForceNetUpdate\(\)/);
 assert.doesNotMatch(stateH,/UFUNCTION\(Server/);
 assert.match(markerH,/UPROPERTY\(EditAnywhere, Replicated, BlueprintReadOnly/);
 assert.match(marker,/DOREPLIFETIME\(AVPStoryMarker, Action\)/);
 assert.match(marker,/DOREPLIFETIME\(AVPStoryMarker, bUsed\)/);
});

test('UE5 CH01 actions require true reach, unobstructed visibility and server-owned E input',()=>{
 assert.match(marker,/if \(!HasAuthority\(\) \|\| !IsValid\(Player\)/);
 assert.match(marker,/!Player->IsAlive\(\)/);
 assert.match(marker,/FVector::DistSquared\(/);
 assert.match(marker,/FMath::Square\(275\.f\)/);
 assert.match(marker,/LineTraceTestByChannel\(/);
 assert.match(marker,/ECC_Visibility/);
 assert.match(marker,/State->TryAdvance\(Action\)/);
 const entry=character.slice(character.indexOf('void AVPCharacter::ServerTryInteract_Implementation()'));
 assert.match(entry,/GetGameState<AVPStoryGameState>\(\)/);
 assert.match(entry,/TActorIterator<AVPStoryMarker>/);
 assert.match(entry,/if \(!It->IsAvailable\(\)\) continue/);
 assert.match(entry,/FVector::DistSquared\(/);
 assert.match(entry,/GetPawnViewLocation\(\),It->GetActorLocation\(\),ECC_Visibility/);
 assert.match(entry,/if \(Nearest\) Nearest->TryActivate\(this\)/);
 const storyBranch=entry.indexOf('GetGameState<AVPStoryGameState>()');
 const brPickups=entry.indexOf('AVPPickup* Nearest');
 assert.ok(storyBranch>=0&&brPickups>storyBranch);
 assert.match(entry.slice(storyBranch,brPickups),/return;\s*}/);
});

test('UE5 story HUD hides the BR-only zone and supply UI until a real BR game mode is used',()=>{
 assert.match(hud,/#include "VPStoryGameState.h"/);
 const storyAt=hud.indexOf('GetGameState<AVPStoryGameState>()');
 const brSupplies=hud.indexOf('const FString SupplyLabel');
 const brZone=hud.indexOf('AVPZone* Zone = CachedZone.Get()');
 assert.ok(storyAt>=0&&brSupplies>storyAt&&brZone>brSupplies);
 assert.match(hud.slice(storyAt,brSupplies),/Story->GetObjectiveLabel\(\)/);
 assert.match(hud.slice(storyAt,brSupplies),/return;/);
 const classBranch=world.indexOf('IsA(AVPStoryWorldBootstrap::StaticClass())');
 const storyReturn=world.indexOf('return; // Story preview never spawns the random BR loot pool');
 const brSpawn=world.indexOf('SpawnActor<AVPPickup>');
 assert.ok(classBranch>=0&&storyReturn>classBranch&&brSpawn>storyReturn,
  'native story uses a class-stable local blockout rather than BR loot and world state race');
});

test('UE5 CH01 only shows live replicated objectives and prioritizes physically reachable markers',()=>{
 assert.match(marker,/PrimaryActorTick\.TickInterval = \.25f/);
 assert.match(marker,/void AVPStoryMarker::BeginPlay\(\)/);
 assert.match(marker,/void AVPStoryMarker::Tick\(float DeltaSeconds\)/);
 assert.match(marker,/Model->SetVisibility\(IsAvailable\(\)\)/);
 assert.match(marker,/Model->SetVisibility\(false\)/);
 const entry=character.slice(character.indexOf('void AVPCharacter::ServerTryInteract_Implementation()'));
 const start=entry.indexOf('GetGameState<AVPStoryGameState>()');
 const end=entry.indexOf('AVPPickup* Nearest',start);
 const selection=entry.slice(start,end);
 assert.match(selection,/float BestDistanceSq = FMath::Square\(275\.f\)/);
 assert.match(selection,/if \(DistanceSq >= BestDistanceSq\) continue/);
 assert.match(selection,/LineTraceTestByChannel\(/);
 assert.match(selection,/if \(Nearest\) Nearest->TryActivate\(this\)/);
 assert.doesNotMatch(selection,/FindActor.*Ignored/);
});
