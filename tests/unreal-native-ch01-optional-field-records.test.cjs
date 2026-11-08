'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../Unreal/Veilpoint/Source/Veilpoint');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const state=read('VPStoryGameState.cpp'),mode=read('VPStoryGameMode.cpp');
const part=(text,a,b)=>text.slice(text.indexOf(a),text.indexOf(b,text.indexOf(a)+a.length));
test('UE5 CH01 native interaction permits genuine local route choice before optional paper records',()=>{
 const available=part(state,'bool AVPStoryGameState::IsAvailable(', 'bool AVPStoryGameState::TryAdvance(');
 const records=part(available,'case EVPStoryStage::InspectRecords:', 'case EVPStoryStage::ChooseRoute:');
 assert.match(records,/Action == EVPStoryAction::ChooseSouth/);
 assert.match(records,/Action == EVPStoryAction::ChooseEast/);
 assert.match(records,/Action == EVPStoryAction::ReadHarbor && !bReadHarbor/);
 assert.match(records,/Action == EVPStoryAction::ReadShelter && !bReadShelter/);
 // The direct South/East permission must not be wrapped in a records check.
 assert.doesNotMatch(records,/if\s*\(\s*bReadHarbor|if\s*\(\s*bReadShelter/);
 const advance=part(state,'bool AVPStoryGameState::TryAdvance(', 'FString AVPStoryGameState::GetObjectiveLabel(');
 assert.match(advance,/if \(!HasAuthority\(\) \|\| !IsAvailable\(Action\)\) return false/);
 assert.match(advance,/case EVPStoryAction::ChooseSouth:[\s\S]*?StoryStage = EVPStoryStage::SouthExit/);
 assert.match(advance,/case EVPStoryAction::ChooseEast:[\s\S]*?StoryStage = EVPStoryStage::EastExit/);
 assert.match(advance,/Mode->PersistStoryCheckpoint\(\)/);
 assert.doesNotMatch(available,/OriginalDeploymentOrder|FirstAssignmentDocument/);
});
test('UE5 direct-route save restores from either schema generation without minting optional evidence',()=>{
 const restore=part(state,'bool AVPStoryGameState::RestoreProgress(', 'bool AVPStoryGameState::IsAvailable(');
 const coherent=part(mode,'bool IsCoherentSaved(', 'UVPStoryCheckpoint* ReadVerifiedCheckpoint(');
 const later=part(restore,'case EVPStoryStage::ChooseRoute:', 'default:');
 assert.match(later,/case EVPStoryStage::SouthExit:/);
 assert.match(later,/case EVPStoryStage::EastExit:/);
 assert.match(later,/case EVPStoryStage::Complete:/);
 assert.match(later,/bCoherent = true; break/);
 assert.doesNotMatch(later,/bHarbor && bShelter/);
 assert.match(restore,/case EVPStoryStage::RestoreRelay:[\s\S]*?bCoherent = !bHarbor && !bShelter/);
 assert.match(restore,/if \(!bCoherent \|\| \(bBeacon && Stage == EVPStoryStage::RestoreRelay\)\) return false/);
 assert.ok(restore.indexOf('StoryStage = Stage')>restore.indexOf('if (!bCoherent'));
 assert.match(coherent,/Saved->SchemaVersion != 1 && Saved->SchemaVersion != 2/);
 assert.match(coherent,/case EVPStoryStage::RestoreRelay: return !Harbor && !Shelter && !Beacon/);
 assert.match(coherent,/case EVPStoryStage::SouthExit:[\s\S]*?case EVPStoryStage::Complete:[\s\S]*?return true/);
 assert.doesNotMatch(coherent,/return Harbor && Shelter/);
 const write=mode.slice(mode.indexOf('bool AVPStoryGameMode::PersistStoryCheckpoint()'));
 for(const name of ['bSavedHarborRecord','bSavedShelterRecord','bSavedBeaconActivated'])
  assert.match(write,new RegExp('Saved->'+name+' = State->'));
 assert.match(write,/ReadVerifiedCheckpoint\(CH01Slot\)/);
 assert.match(write,/Check->SavedStage == Saved->SavedStage/);
});
test('UE5 native story objective context states Korea pre-briefing and unexpected escalation, never a document gate',()=>{
 const label=state.slice(state.indexOf('FString AVPStoryGameState::GetObjectiveLabel()'));
 assert.match(label,/Korea briefing complete; unexpected harbor escalation/);
 assert.match(label,/Choose south rescue or east passage \(optional records %d\/2\)/);
 assert.doesNotMatch(label,/Inspect harbor and shelter logs/);
 assert.match(label,/case EVPStoryStage::SouthExit:[\s\S]*?Reach the south courtyard/);
 assert.match(label,/case EVPStoryStage::EastExit:[\s\S]*?Reach the east checkpoint/);
});
