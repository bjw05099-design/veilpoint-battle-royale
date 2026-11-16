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
 assert.match(section,/Shape\(Model,FVector\(52,60,118\)/,'grounded relay cabinet');
 assert.match(section,/Shape\(Model,FVector\(80,76,8\)/,'records lie on a table');
 assert.match(section,/Shape\(Model,FVector\(14,14,170\)/,'route choices use a signpost');
 assert.match(section,/GroundLocalZ/);
 assert.match(section,/LastShapeAction==int32\(Action\)/,'rebuild only on type or state changes');
 assert.match(section,/Part->SetVisibility\(true\)/,'used equipment remains in the world');
 assert.match(source,/GroundEquipment\(\)/);
 assert.match(source,/void AVPStoryMarker::BeginPlay\(\)[\s\S]*?ApplyStageShape\(\);/);
 assert.match(source,/void AVPStoryMarker::Tick\(float DeltaSeconds\)[\s\S]*?ApplyStageShape\(\);/);
});
test('native visual markers preserve finite local E interaction and no extra gameplay RPC',()=>{
 const source=read('VPStoryMarker.cpp');
 const header=read('VPStoryMarker.h');
 assert.match(source,/Model->SetCollisionEnabled\(ECollisionEnabled::QueryAndPhysics\)/);
 assert.match(source,/FMath::Square\(275\.f\)/);
 assert.match(source,/State->TryAdvance\(Action\)/);
 assert.match(source,/DOREPLIFETIME\(AVPStoryMarker, Action\)/);
 assert.doesNotMatch(header,/UFUNCTION\(Server/);
});
