'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'../Unreal/Veilpoint/Source/Veilpoint');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');

test('UE5 story has a real optional physical action with server-replicated beacon and local illumination',()=>{
 const sh=read('VPStoryGameState.h'),sc=read('VPStoryGameState.cpp');
 const gh=read('VPStoryGameMode.cpp'),mc=read('VPStoryMarker.cpp'),mh=read('VPStoryMarker.h');
 assert.match(sh,/ReachEast, ActivateBeacon/,'append preserves existing authored action IDs');
 assert.match(sh,/bool bBeaconActivated = false/);
 assert.match(sc,/DOREPLIFETIME\(AVPStoryGameState, bBeaconActivated\)/);
 assert.match(sc,/if \(Action == EVPStoryAction::ActivateBeacon\)/);
 assert.match(sc,/StoryStage != EVPStoryStage::RestoreRelay/);
 assert.match(sc,/StoryStage != EVPStoryStage::Complete;/);
 assert.match(sc,/case EVPStoryAction::ActivateBeacon:[\s\S]*?bBeaconActivated = !bBeaconActivated/);
 assert.match(gh,/EVPStoryAction::ActivateBeacon, FVector\(650\.f, -650\.f, 120\.f\)/);
 assert.match(mh,/TObjectPtr<UPointLightComponent> BeaconLight/);
 assert.match(mc,/CreateDefaultSubobject<UPointLightComponent>\(TEXT\("HarborSignalLight"\)\)/);
 assert.match(mc,/State && State->bBeaconActivated/);
 assert.match(mc,/BeaconLight->SetVisibility\(bLit\)/);
 assert.match(mc,/SyncBeaconLight\(\);/);
 assert.match(mc,/FMath::Square\(275\.f\)/,'same physical E interaction check is required');
 assert.match(mc,/if \(Action != EVPStoryAction::ActivateBeacon\)\s*bUsed = true/);
 assert.match(mc,/if \(Model\) Model->SetVisibility\(IsAvailable\(\)\)/);
});
test('UE5 native CH01 V2 beacon save keeps V1 checkpoint compatibility and readback proof',()=>{
 const data=read('VPStoryCheckpoint.h'),mode=read('VPStoryGameMode.cpp'),state=read('VPStoryGameState.cpp');
 assert.match(data,/int32 SchemaVersion = 2/);
 assert.match(data,/bool bSavedBeaconActivated = false/);
 assert.match(mode,/Saved->SchemaVersion != 1 && Saved->SchemaVersion != 2/);
 assert.match(mode,/Saved->SchemaVersion == 2 && Saved->bSavedBeaconActivated/);
 assert.match(mode,/Saved->SchemaVersion = 2/);
 assert.match(mode,/Saved->bSavedBeaconActivated = State->bBeaconActivated/);
 assert.match(mode,/Check->bSavedBeaconActivated == Saved->bSavedBeaconActivated/);
 assert.match(mode,/Primary->SchemaVersion == 2 && Primary->bSavedBeaconActivated/);
 assert.match(mode,/Backup->SchemaVersion == 2 && Backup->bSavedBeaconActivated/);
 assert.match(state,/bBeacon && Stage == EVPStoryStage::RestoreRelay/);
 assert.match(state,/bBeaconActivated = bBeacon/);
 assert.doesNotMatch(shadow(mode),/http:|WebSocket|curl |external_api/);
});
function shadow(source){return source.slice(source.indexOf('void AVPStoryGameMode::RestoreStoryCheckpoint()'));}
