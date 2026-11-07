'use strict';
// UE5 source-level checkpoint gate; actual UBT compile, SaveGame filesystem
// semantics, launch and multiplayer PIE still require a Windows UE engine.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../Unreal/Veilpoint/Source/Veilpoint');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const save=read('VPStoryCheckpoint.h');
const mode=read('VPStoryGameMode.cpp'),modeH=read('VPStoryGameMode.h');
const state=read('VPStoryGameState.cpp'),stateH=read('VPStoryGameState.h');
const marker=read('VPStoryMarker.cpp');

test('UE5 CH01 native objective save is versioned, local and independent of browser BR checkpoint',()=>{
 assert.match(save,/class VEILPOINT_API UVPStoryCheckpoint : public USaveGame/);
 for(const field of ['SchemaVersion','SavedStage','bSavedHarborRecord','bSavedShelterRecord'])
  assert.match(save,new RegExp('UPROPERTY\\(SaveGame\\)[\\s\\S]*?\\b'+field+'\\b'));
 assert.match(save,/SchemaVersion = 1/);
 assert.match(mode,/veilpoint\.ch01\.native\.v1/);
 assert.doesNotMatch(mode,/veilpoint\.brCheckpoint|ve​ilpoint\.graphics|cloud/);
 assert.doesNotMatch(mode,/SavedPlayerTransform|SavedAmmo|SavedHealth/);
});

test('UE5 standalone authority gate guards native load and save, not replicated match',()=>{
 assert.match(mode,/GetNetMode\(\) != NM_Standalone/);
 assert.match(mode,/HasAuthority\(\)/);
 assert.match(mode,/DoesSaveGameExist\(CH01Slot, CH01UserIndex\)/);
 assert.match(mode,/LoadGameFromSlot\(CH01Slot, CH01UserIndex\)/);
 assert.match(mode,/Saved->SchemaVersion != 1/);
 assert.match(mode,/Saved->SavedStage, Saved->bSavedHarborRecord, Saved->bSavedShelterRecord/);
 assert.match(mode,/SaveGameToSlot\(Saved, CH01Slot, CH01UserIndex\)/);
 assert.match(mode,/if \(!bWritten\)/);
 assert.match(mode,/memory-only/);
 assert.doesNotMatch(modeH,/UFUNCTION\(Server|NetMulticast|Client/);
});

test('UE5 CH01 rejects impossible restore states and does not mint unearned objective completion',()=>{
 const fn=state.slice(state.indexOf('bool AVPStoryGameState::RestoreProgress('),
  state.indexOf('bool AVPStoryGameState::IsAvailable('));
 assert.match(fn,/if \(!HasAuthority\(\)\) return false/);
 assert.match(fn,/case EVPStoryStage::RestoreRelay:[\s\S]*?bCoherent = !bHarbor && !bShelter/);
 assert.match(fn,/case EVPStoryStage::InspectRecords:[\s\S]*?bCoherent = !\(bHarbor && bShelter\)/);
 assert.match(fn,/case EVPStoryStage::ChooseRoute:[\s\S]*?case EVPStoryStage::Complete:[\s\S]*?bCoherent = bHarbor && bShelter/);
 assert.match(fn,/default:\s*return false/);
 assert.match(fn,/if \(!bCoherent\) return false/);
 assert.ok(fn.indexOf('if (!bCoherent) return false')<fn.indexOf('StoryStage = Stage'),
  'validate before altering the authoritative mission');
 assert.match(fn,/ForceNetUpdate\(\)/);
 assert.match(stateH,/bool RestoreProgress\(EVPStoryStage Stage, bool bHarbor, bool bShelter\)/);
});

test('UE5 CH01 progression attempts persistence only after a valid physical objective interaction',()=>{
 const advance=state.slice(state.indexOf('bool AVPStoryGameState::TryAdvance('),
  state.indexOf('FString AVPStoryGameState::GetObjectiveLabel'));
 assert.match(advance,/if \(!HasAuthority\(\) \|\| !IsAvailable\(Action\)\) return false/);
 assert.match(advance,/Mode->PersistStoryCheckpoint\(\)/);
 assert.match(advance,/ForceNetUpdate\(\)/);
 assert.match(mode,/void AVPStoryGameMode::BeginPlay\(\)[\s\S]*?RestoreStoryCheckpoint\(\)/);
 assert.match(marker,/State->TryAdvance\(Action\)/);
 assert.doesNotMatch(save,/bEliminated|WinningTeam|ClientSession/);
});
