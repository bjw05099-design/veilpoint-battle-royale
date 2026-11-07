'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const src=name=>fs.readFileSync(path.join(__dirname,'../Unreal/Veilpoint/Source/Veilpoint',name),'utf8');
test('UE5 native mission marker creates a reusable in-world text component with correct roles',()=>{
 const h=src('VPStoryMarker.h'),cpp=src('VPStoryMarker.cpp');
 assert.match(h,/class UTextRenderComponent;/);
 assert.match(h,/TObjectPtr<UTextRenderComponent> ObjectiveLabel/);
 assert.match(cpp,/#include "Components\/TextRenderComponent.h"/);
 assert.match(cpp,/CreateDefaultSubobject<UTextRenderComponent>\(TEXT\("MissionNameplate"\)\)/);
 assert.match(cpp,/ObjectiveLabel->SetWorldSize\(18.f\)/);
 assert.match(cpp,/ObjectiveLabel->SetRelativeLocation\(FVector\(0.f,0.f,48.f\)\)/);
 assert.match(cpp,/ObjectiveLabel->SetHorizontalAlignment\(EHTA_Center\)/);
 const labels=cpp.slice(cpp.indexOf('void AVPStoryMarker::SyncObjectiveText()'),cpp.indexOf('void AVPStoryMarker::ApplyStageShape()'));
 for(const action of ['RestoreRelay','ActivateBeacon','ReadHarbor','ReadShelter',
  'ChooseSouth','ChooseEast','ReachSouth','ReachEast'])
  assert.match(labels,new RegExp('EVPStoryAction::'+action));
 assert.match(labels,/ObjectiveLabel->SetText\(FText::FromString\(Label\)\)/);
 assert.match(labels,/ObjectiveLabel->SetVisibility\(bShown\)/);
 assert.match(cpp,/if \(LastObjectiveText != Label\)/,'avoid rebuilding the text renderer every quarter second');
});
test('UE5 marker nameplates follow replicated availability without changing gameplay RPCs',()=>{
 const h=src('VPStoryMarker.h'),cpp=src('VPStoryMarker.cpp');
 assert.match(cpp,/void AVPStoryMarker::BeginPlay\([\s\S]*?SyncObjectiveText\(\)/);
 assert.match(cpp,/void AVPStoryMarker::Tick\([\s\S]*?SyncObjectiveText\(\)/);
 assert.match(cpp,/bool AVPStoryMarker::TryActivate\([\s\S]*?SyncObjectiveText\(\)/);
 assert.match(cpp,/const bool bShown=IsAvailable\(\)&&bNearby&&bClearView/);
 assert.match(cpp,/FVector::DistSquared2D\(/);
 assert.match(cpp,/FMath::Square\(500.f\)/);
 assert.match(cpp,/LineTraceTestByChannel\(/);
 assert.match(cpp,/ECC_Visibility/);
 assert.doesNotMatch(h,/UFUNCTION\(Server/);
 assert.match(cpp,/FMath::Square\(275\.f\)/,'existing local physical objective range is unchanged');
});
