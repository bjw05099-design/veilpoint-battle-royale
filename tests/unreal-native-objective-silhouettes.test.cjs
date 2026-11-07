'use strict';
// UE source-level checks: this does not claim UBT compilation or PIE proof.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const read=name=>fs.readFileSync(path.join(__dirname,'../Unreal/Veilpoint/Source/Veilpoint',name),'utf8');

test('UE5 authored CH01 objective silhouettes distinguish relay, records, decision and exits',()=>{
 const source=read('VPStoryMarker.cpp');
 const header=read('VPStoryMarker.h');
 assert.match(header,/void ApplyStageShape\(\);/);
 const section=source.slice(source.indexOf('void AVPStoryMarker::ApplyStageShape()'),source.indexOf('void AVPStoryMarker::GetLifetimeReplicatedProps'));
 for(const name of ['RestoreRelay','ReadHarbor','ReadShelter','ChooseSouth','ChooseEast','ReachSouth','ReachEast'])
  assert.match(section,new RegExp('EVPStoryAction::'+name));
 assert.match(section,/Shape = FVector\(\.52f, \.52f, 1\.2f\)/);
 assert.match(section,/Shape = FVector\(\.70f, \.70f, \.15f\)/);
 assert.match(section,/GetRelativeScale3D\(\)\.Equals\(Shape, \.001f\)/);
 assert.match(section,/Model->SetRelativeScale3D\(Shape\)/);
 assert.match(source,/void AVPStoryMarker::BeginPlay\(\)[\s\S]*?ApplyStageShape\(\);/);
 assert.match(source,/void AVPStoryMarker::Tick\(float DeltaSeconds\)[\s\S]*?ApplyStageShape\(\);/);
});
test('native visual markers preserve finite local E interaction and no extra gameplay RPC',()=>{
 const source=read('VPStoryMarker.cpp');
 const header=read('VPStoryMarker.h');
 assert.match(source,/Model->SetCollisionEnabled\(ECollisionEnabled::NoCollision\)/);
 assert.match(source,/FMath::Square\(275\.f\)/);
 assert.match(source,/State->TryAdvance\(Action\)/);
 assert.match(source,/DOREPLIFETIME\(AVPStoryMarker, Action\)/);
 assert.doesNotMatch(header,/UFUNCTION\(Server/);
});
