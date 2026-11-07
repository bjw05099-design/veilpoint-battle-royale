'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const read=x=>fs.readFileSync(path.join(__dirname,'../Unreal/Veilpoint/Source/Veilpoint',x),'utf8');
// Source-level contracts only. Native UBT/PIE gamepad/keyboard execution
// remains a separate release verification gate, never claimed here.
test('UE5 native CH01 beacon switch can be physically reused after relay and before exit',()=>{
 const state=read('VPStoryGameState.cpp'),marker=read('VPStoryMarker.cpp');
 const avail=state.slice(state.indexOf('bool AVPStoryGameState::IsAvailable('),
   state.indexOf('bool AVPStoryGameState::TryAdvance('));
 assert.match(avail,/Action == EVPStoryAction::ActivateBeacon/);
 assert.match(avail,/StoryStage != EVPStoryStage::RestoreRelay/);
 assert.match(avail,/StoryStage != EVPStoryStage::Complete;/);
 assert.doesNotMatch(avail,/&& !bBeaconActivated/,'light-on is not a one-shot lock');
 assert.match(state,/case EVPStoryAction::ActivateBeacon:[\s\S]*?bBeaconActivated = !bBeaconActivated/);
 const entry=marker.slice(marker.indexOf('bool AVPStoryMarker::TryActivate('));
 assert.match(entry,/FMath::Square\(275\.f\)/);
 assert.match(entry,/LineTraceTestByChannel/);
 assert.match(entry,/State->TryAdvance\(Action\)/);
 assert.match(entry,/if \(Action != EVPStoryAction::ActivateBeacon\)\s*bUsed = true/);
 assert.match(entry,/Model->SetVisibility\(IsAvailable\(\)\)/);
 assert.match(entry,/SyncBeaconLight\(\);/);
});
test('UE5 every on/off transition still serializes the same V2 offline CH01 field',()=>{
 const state=read('VPStoryGameState.cpp'),mode=read('VPStoryGameMode.cpp');
 assert.match(state,/bBeaconActivated = !bBeaconActivated/);
 assert.match(state,/Mode->PersistStoryCheckpoint\(\)/);
 assert.match(mode,/Saved->bSavedBeaconActivated = State->bBeaconActivated/);
 assert.match(mode,/Check->bSavedBeaconActivated == Saved->bSavedBeaconActivated/);
 assert.match(mode,/Saved->SchemaVersion != 1 && Saved->SchemaVersion != 2/);
});
