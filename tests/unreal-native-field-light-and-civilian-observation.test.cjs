'use strict';
// These checks validate UE5 source contracts. Node CI cannot compile or launch
// Unreal; full native Win64/PIE evidence must be gathered separately.
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../Unreal/Veilpoint');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const header=read('Source/Veilpoint/VPCharacter.h');
const character=read('Source/Veilpoint/VPCharacter.cpp');
const hud=read('Source/Veilpoint/VPHUD.cpp');
const input=read('Config/DefaultInput.ini');
const pedestrian=read('Source/Veilpoint/VPStoryPedestrian.cpp');
const pedestrianHeader=read('Source/Veilpoint/VPStoryPedestrian.h');

test('native F key controls an actual attached light cone, not a full-screen fake vision filter',()=>{
 assert.match(input,/ActionName="FieldLight",Key=F/);
 assert.match(character,/#include "Components\/SpotLightComponent.h"/);
 assert.match(header,/TObjectPtr<USpotLightComponent> FieldLight/);
 assert.match(character,/CreateDefaultSubobject<USpotLightComponent>\(TEXT\("HelmetFieldLight"\)\)/);
 assert.match(character,/FieldLight->SetupAttachment\(BodyCamera\)/);
 assert.match(character,/FieldLight->SetMobility\(EComponentMobility::Movable\)/);
 for(const operation of ['SetIntensity','SetAttenuationRadius','SetInnerConeAngle','SetOuterConeAngle','SetVisibility'])
  assert.ok(character.includes('FieldLight->'+operation+'('),operation);
 assert.match(character,/BindAction\(TEXT\("FieldLight"\), IE_Pressed, this, &AVPCharacter::ToggleFieldLight\)/);
 assert.doesNotMatch(character,/PostProcessBlendWeight|SetActorLocation\(.*FieldLight/);
});
test('native finite 10-minute light uses existing authority-owned 60 Hz movement steps and cannot be turned on when exhausted',()=>{
 assert.match(header,/FieldLightSecondsRemaining = 600\.f/);
 assert.match(header,/UPROPERTY\(ReplicatedUsing=OnRep_FieldLightState/);
 assert.match(header,/UFUNCTION\(Server, Reliable\)\s*void ServerToggleFieldLight\(\)/);
 assert.match(character,/DOREPLIFETIME\(AVPCharacter, bFieldLightOn\)/);
 assert.match(character,/DOREPLIFETIME_CONDITION\(AVPCharacter, FieldLightSecondsRemaining, COND_OwnerOnly\)/);
 assert.match(character,/void AVPCharacter::ServerToggleFieldLight_Implementation\(\)/);
 assert.match(character,/if \(!HasAuthority\(\) \|\| !IsAlive\(\)\) return/);
 assert.match(character,/FieldLightSecondsRemaining <= 0\.f\) return/);
 assert.match(character,/FieldLightSecondsRemaining - FixedSeconds/);
 assert.match(character,/if \(FieldLightSecondsRemaining <= 1\.e-6f\)/);
 assert.match(character,/FieldLightSecondsRemaining = 0\.f/);
 assert.match(character,/UpdateSprintFixedStep\(FixedStep\)/);
 assert.match(character,/void AVPCharacter::OnRep_FieldLightState\(\)/);
 assert.match(character,/FieldLight->SetVisibility\(IsAlive\(\) && bFieldLightOn/);
 assert.match(character,/void AVPCharacter::OnRep_Eliminated\(\)/);
 assert.match(character,/bFieldLightOn = false;\s*OnRep_FieldLightState\(\)/);
 // The request transmits no client-authored charge, duration or light pose.
 assert.doesNotMatch(header,/ServerToggleFieldLight\([^)]{1,}/);
});
test('native HUD shows replicated battery and mode-specific civilian observation without fabricated map-wide rescue status',()=>{
 assert.match(hud,/Pawn->bFieldLightOn \? TEXT\("ON"\) : TEXT\("OFF"\)/);
 assert.match(hud,/Pawn->FieldLightSecondsRemaining/);
 assert.match(hud,/GetGameState<AVPStoryGameState>\(\)/);
 assert.match(hud,/#include "VPStoryPedestrian.h"/);
 const start=hud.indexOf('for (TActorIterator<AVPStoryPedestrian> It(World)');
 const end=hud.indexOf('        return;',start);
 assert.ok(start>0&&end>start);
 const observed=hud.slice(start,end);
 assert.match(observed,/ToPerson.SizeSquared\(\)>FMath::Square\(1400\.f\)/);
 assert.match(observed,/DotProduct\(PlayerOwner->GetControlRotation\(\).Vector\(\),ToPerson\)<=0\.f/);
 assert.match(observed,/ProjectWorldLocationToScreen/);
 assert.match(observed,/LineTraceTestByChannel\(Eye/);
 assert.match(observed,/ECC_Visibility/);
 assert.match(observed,/Person->bReachedSouthCourtyard/);
 assert.match(observed,/WALKED TO THE SOUTH PUBLIC COURT/);
 assert.match(observed,/WALKING THROUGH THE SOUTH LANE/);
 assert.doesNotMatch(observed,/TryAdvance\(|ServerTry|GetAllActorsOfClass|Enemy/);
});
test('civilian status is a real native replicated fixed-speed walking actor, never a client-issued arrival claim',()=>{
 assert.match(pedestrianHeader,/UPROPERTY\(Replicated, BlueprintReadOnly/);
 assert.match(pedestrian,/DOREPLIFETIME\(AVPStoryPedestrian,bReachedSouthCourtyard\)/);
 assert.match(pedestrian,/if \(!HasAuthority\(\) \|\| bReachedSouthCourtyard/);
 assert.match(pedestrian,/constexpr float StepSeconds = 1\.f\/60\.f/);
 assert.match(pedestrian,/AddActorWorldOffset\(Delta,true,&Hit,ETeleportType::None\)/);
 assert.match(pedestrian,/bReachedSouthCourtyard=true/);
});
