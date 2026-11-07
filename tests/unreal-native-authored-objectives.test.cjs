'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.resolve(__dirname,'../Unreal/Veilpoint/Source/Veilpoint',p),'utf8');

test('UE5 CH01 native startup reuses hand-authored physical objective markers and fills only missing actions',()=>{
 const source=read('VPStoryGameMode.cpp');
 assert.match(source,/#include "EngineUtils.h"/);
 const actionScan=source.indexOf('for (TActorIterator<AVPStoryMarker> It(GetWorld()); It; ++It)');
 const spawnLoop=source.indexOf('for (const FMarkerPlacement& Placement : Markers)');
 assert.ok(actionScan>=0&&spawnLoop>actionScan,'scan authored actions before spawning fallback markers');
 assert.match(source.slice(actionScan,spawnLoop),/AuthoredActions\.AddUnique\(It->Action\)/);
 const remainder=source.slice(spawnLoop,source.indexOf('RestoreStoryCheckpoint();',spawnLoop));
 assert.match(remainder,/if \(AuthoredActions\.Contains\(Placement\.Action\)\) continue/);
 assert.match(remainder,/SpawnActor<AVPStoryMarker>/);
 assert.match(remainder,/Marker->Action = Placement\.Action/);
 assert.match(remainder,/AuthoredActions\.AddUnique\(Placement\.Action\)/);
 assert.doesNotMatch(remainder,/Destroy\(|SetActorLocation\(/,
  'do not destroy/move manually authored mission objects');
});

test('native story world bootstrap does not duplicate a manually placed level actor',()=>{
 const source=read('VPStoryGameMode.cpp');
 const scan=source.indexOf('for (TActorIterator<AVPStoryWorldBootstrap> It(GetWorld()); It; ++It)');
 const spawn=source.indexOf('SpawnActor<AVPStoryWorldBootstrap>');
 assert.ok(scan>=0&&spawn>scan);
 assert.match(source.slice(scan,spawn),/if \(!bHasStoryWorld\)/);
 assert.match(source,/PrimaryActorTick\.bCanEverTick = false/);
});
