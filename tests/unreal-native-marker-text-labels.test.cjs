'use strict';
// UE5 source integration contracts; native UBT compilation / PIE is not simulated.
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'../Unreal/Veilpoint/Source/Veilpoint/');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
test('UE5 CH01 native objectives carry distinct three-dimensional local text labels',()=>{
 const h=read('VPStoryMarker.h'),cpp=read('VPStoryMarker.cpp');
 assert.match(h,/class UTextRenderComponent;/);
 assert.match(h,/TObjectPtr<UTextRenderComponent> ObjectiveLabel;/);
 assert.match(cpp,/#include "Components\/TextRenderComponent.h"/);
 assert.match(cpp,/CreateDefaultSubobject<UTextRenderComponent>\(TEXT\("MissionObjectiveLabel"\)\)/);
 for(const label of ['RELAY','BEACON','HARBOR RECORD','SHELTER RECORD','SOUTH ROUTE','EAST ROUTE','SOUTH EXIT','EAST EXIT'])
  assert.match(cpp,new RegExp('Label=TEXT\\("'+label+'"\\)'));
 assert.match(cpp,/ObjectiveLabel->SetText\(FText::FromString\(Label\)\)/);
 assert.match(cpp,/LastObjectiveLabel != Label/,'update replicated objective only when action changes');
 assert.match(cpp,/ObjectiveLabel->SetVisibility\(bAvailable\)/,'old objective labels hide when mission moves');
 assert.match(cpp,/const bool bAvailable=IsAvailable\(\)/);
});
test('labels do not create a second authorization, invisible detector, or network RPC',()=>{
 const cpp=read('VPStoryMarker.cpp'),header=read('VPStoryMarker.h');
 assert.match(cpp,/FMath::Square\(275\.f\)/);
 assert.match(cpp,/LineTraceTestByChannel/);
 assert.match(cpp,/State->TryAdvance\(Action\)/);
 assert.match(cpp,/DOREPLIFETIME\(AVPStoryMarker, Action\)/);
 assert.doesNotMatch(header,/UFUNCTION\(Server/);
});
