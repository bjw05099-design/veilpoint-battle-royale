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
 assert.match(save,/SchemaVersion = 3/);
 assert.match(mode,/Saved->SchemaVersion != 2/);
 assert.match(mode,/Saved->SchemaVersion != 3/);
 assert.match(save,/bSavedBeaconActivated = false/);
 assert.match(save,/bHasPedestrianPose = false/);
 assert.match(save,/SavedPedestrianPosition = FVector::ZeroVector/);
 assert.match(mode,/veilpoint\.ch01\.native\.v1/);
 assert.doesNotMatch(mode,/veilpoint\.brCheckpoint|ve​ilpoint\.graphics|cloud/);
 assert.doesNotMatch(mode,/SavedPlayerTransform|SavedAmmo|SavedHealth/);
});

test('UE5 standalone authority gate guards native load and save, not replicated match',()=>{
 assert.match(mode,/GetNetMode\(\) != NM_Standalone/);
 assert.match(mode,/HasAuthority\(\)/);
 assert.match(mode,/DoesSaveGameExist\(CH01Slot, CH01UserIndex\)/);
 assert.match(mode,/LoadGameFromSlot\(Slot, CH01UserIndex\)/);
 assert.match(mode,/Saved->SchemaVersion != 1/);
 assert.match(mode,/Primary->SavedStage, Primary->bSavedHarborRecord, Primary->bSavedShelterRecord/);
 assert.match(mode,/SaveGameToSlot\(Saved, CH01Slot, CH01UserIndex\)/);
 assert.match(mode,/if \(!bVerified\)/);
 assert.match(mode,/memory-only/);
 assert.doesNotMatch(modeH,/UFUNCTION\(Server|NetMulticast|Client/);
});

test('UE5 CH01 rejects impossible restore states and does not mint unearned objective completion',()=>{
 const fn=state.slice(state.indexOf('bool AVPStoryGameState::RestoreProgress('),
  state.indexOf('bool AVPStoryGameState::IsAvailable('));
 assert.match(fn,/if \(!HasAuthority\(\)\) return false/);
 assert.match(fn,/case EVPStoryStage::RestoreRelay:[\s\S]*?bCoherent = !bHarbor && !bShelter/);
 assert.match(fn,/case EVPStoryStage::InspectRecords:[\s\S]*?bCoherent = !\(bHarbor && bShelter\)/);
 assert.match(fn,/case EVPStoryStage::ChooseRoute:[\s\S]*?case EVPStoryStage::Complete:[\s\S]*?bCoherent = true; break/);
 assert.doesNotMatch(fn,/bCoherent = bHarbor && bShelter/,'later routes do not require optional papers');
 assert.match(fn,/default:\s*return false/);
 assert.match(fn,/if \(!bCoherent \|\| \(bBeacon && Stage == EVPStoryStage::RestoreRelay\)\) return false/);
 assert.ok(fn.indexOf('if (!bCoherent || (bBeacon && Stage == EVPStoryStage::RestoreRelay)) return false')<fn.indexOf('StoryStage = Stage'),
  'validate before altering the authoritative mission');
 assert.match(fn,/ForceNetUpdate\(\)/);
 assert.match(stateH,/bool RestoreProgress\(EVPStoryStage Stage, bool bHarbor, bool bShelter, bool bBeacon\)/);
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

test('native CH01 checkpoint restores only coherent evidence, falling back to the prior copy',()=>{
 const clean=mode.slice(mode.indexOf('bool IsCoherentSaved('),mode.indexOf('void AVPStoryGameMode::RestoreStoryCheckpoint()'));
 const recovery=mode.slice(mode.indexOf('void AVPStoryGameMode::RestoreStoryCheckpoint()'),mode.indexOf('bool AVPStoryGameMode::PersistStoryCheckpoint()'));
 assert.match(clean,/Saved->SchemaVersion != 1/);
 assert.match(clean,/case EVPStoryStage::RestoreRelay: return !Harbor && !Shelter/);
 assert.match(clean,/case EVPStoryStage::InspectRecords: return !\(Harbor && Shelter\)/);
 assert.match(clean,/case EVPStoryStage::Complete:[\s\S]*?return true/);
 assert.doesNotMatch(clean,/return Harbor && Shelter/,'direct rescue route must be reloadable');
 assert.match(clean,/return IsCoherentSaved\(Saved\) \? Saved : nullptr/);
 assert.match(recovery,/UVPStoryCheckpoint\* Primary = ReadVerifiedCheckpoint\(CH01Slot\)/);
 assert.match(recovery,/UVPStoryCheckpoint\* Backup = ReadVerifiedCheckpoint\(CH01BackupSlot\)/);
 assert.ok(recovery.indexOf('ReadVerifiedCheckpoint(CH01Slot)')<
  recovery.indexOf('ReadVerifiedCheckpoint(CH01BackupSlot)'),'only inspect backup after primary');
 assert.match(recovery,/Backup && State->RestoreProgress\(/);
 assert.doesNotMatch(recovery,/DeleteGameInSlot\(CH01Slot[^)]*\)\s*;\s*UVPStoryCheckpoint\* Backup/);
});
test('native CH01 saves preserve one previous valid generation and verify actual reread',()=>{
 const write=mode.slice(mode.indexOf('bool AVPStoryGameMode::PersistStoryCheckpoint()'));
 assert.match(write,/UVPStoryCheckpoint\* Previous = ReadVerifiedCheckpoint\(CH01Slot\)/);
 assert.match(write,/SaveGameToSlot\(\s*Previous, CH01BackupSlot, CH01UserIndex\)/);
 assert.ok(write.indexOf('SaveGameToSlot(')<write.indexOf('SaveGameToSlot(Saved, CH01Slot'),
  'backup must be attempted before primary overwrite');
 assert.match(write,/backup failed; retained previous checkpoint/);
 assert.match(write,/bWritten \? ReadVerifiedCheckpoint\(CH01Slot\) : nullptr/);
 assert.match(write,/Check->SavedStage == Saved->SavedStage/);
 assert.match(write,/Check->bSavedHarborRecord == Saved->bSavedHarborRecord/);
 assert.match(write,/Check->bSavedShelterRecord == Saved->bSavedShelterRecord/);
 assert.match(write,/return bVerified/);
});
test('native CH01 explicitly requested fresh story cannot delete checkpoints on ordinary load',()=>{
 const restore=mode.slice(mode.indexOf('void AVPStoryGameMode::RestoreStoryCheckpoint()'),
  mode.indexOf('bool AVPStoryGameMode::PersistStoryCheckpoint()'));
 assert.match(restore,/GetNetMode\(\) != NM_Standalone\) return/);
 assert.match(restore,/FParse::Param\(FCommandLine::Get\(\), TEXT\("VeilpointCH01Fresh"\)\)/);
 assert.match(restore,/DeleteGameInSlot\(Slot, CH01UserIndex\)/);
 assert.match(restore,/could not delete local fresh-start slot/);
 const conditional=restore.indexOf('FParse::Param');
 const deletion=restore.indexOf('DeleteGameInSlot');
 assert.ok(deletion>conditional,'destructive reset is opt-in only');
 assert.match(restore,/starting new local story by explicit launch flag/);
});
