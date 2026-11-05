'use strict';
// Text-level native integration gate. GitHub's Node runner cannot compile
// Unreal Engine; an actual UE5 Windows editor/package test remains mandatory.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,'Unreal/Veilpoint',name),'utf8');
const header=read('Source/Veilpoint/VPCharacter.h');
const character=read('Source/Veilpoint/VPCharacter.cpp');
const hudHeader=read('Source/Veilpoint/VPHUD.h');
const hudSource=read('Source/Veilpoint/VPHUD.cpp');
const gameMode=read('Source/Veilpoint/VPGameMode.cpp');
const input=read('Config/DefaultInput.ini');

test('native sprint uses existing Windows Shift input and a validated server intent RPC',()=>{
 assert.match(input,/ActionName="Sprint",Key=LeftShift/);
 assert.match(character,/BindAction\(TEXT\("Sprint"\), IE_Pressed, this, &AVPCharacter::BeginSprint\)/);
 assert.match(character,/BindAction\(TEXT\("Sprint"\), IE_Released, this, &AVPCharacter::EndSprint\)/);
 assert.match(header,/UFUNCTION\(Server, Reliable\)\s*void ServerSetSprintHeld\(bool bHeld\)/);
 assert.match(character,/ServerSetSprintHeld_Implementation\(bool bHeld\)/);
 assert.match(character,/bSprintHeld = bHeld && IsAlive\(\)/);
 assert.doesNotMatch(character,/void AVPCharacter::BeginSprint\(\)\s*\{\s*GetCharacterMovement\(\)->MaxWalkSpeed/);
});

test('native stamina is a finite replicated 60Hz state, not a render-frame counter',()=>{
 assert.match(header,/UPROPERTY\(Replicated, BlueprintReadOnly, Category="Movement\|Stamina"\)\s*float Stamina = 100\.f/);
 assert.match(header,/UPROPERTY\(ReplicatedUsing=OnRep_SprintState, BlueprintReadOnly, Category="Movement\|Stamina"\)/);
 for(const key of ['Stamina','bSprinting'])assert.match(character,new RegExp('DOREPLIFETIME\\(AVPCharacter, '+key+'\\)'));
 assert.match(header,/virtual void Tick\(float DeltaSeconds\) override/);
 assert.match(character,/constexpr float FixedStep = 1\.f \/ 60\.f/);
 assert.match(character,/constexpr int32 MaxSteps = 8/);
 assert.match(character,/SprintAccumulator = FMath::Min\(SprintAccumulator \+ FMath::Clamp\(DeltaSeconds, 0\.f, \.25f\)/);
 assert.match(character,/UpdateSprintFixedStep\(FixedStep\)/);
 assert.match(character,/if \(!HasAuthority\(\) \|\| !IsAlive\(\)\) return/);
});

test('native sprint drain and cooldown cannot create infinite energy or crouched sprint',()=>{
 assert.match(character,/bSprintExhausted && Stamina >= 25\.f/);
 assert.match(character,/bSprintHeld && !bIsCrouched && bMoving &&/);
 assert.match(character,/!bSprintExhausted && Stamina > 0\.f/);
 assert.match(character,/Stamina = FMath::Max\(0\.f, Stamina - 20\.f \* FixedSeconds\)/);
 assert.match(character,/Stamina = FMath::Min\(100\.f, Stamina \+ 13\.f \* FixedSeconds\)/);
 assert.match(character,/bSprinting = bNowSprinting/);
 assert.match(character,/MaxWalkSpeed = IsAlive\(\) && bSprinting \? 720\.f : 490\.f/);
 assert.match(character,/void AVPCharacter::OnRep_SprintState\(\) \{ ApplySprintSpeed\(\); \}/);
 assert.match(character,/bEliminated = true;\s*bSprintHeld = false;\s*bSprinting = false/);
});

test('native HUD reads current pawn replicated state without browsers or hidden opponents',()=>{
 assert.match(hudHeader,/class VEILPOINT_API AVPHUD : public AHUD/);
 assert.match(gameMode,/#include "VPHUD.h"/);
 assert.match(gameMode,/HUDClass=AVPHUD::StaticClass\(\)/);
 assert.match(hudSource,/PlayerOwner->GetPawn\(\)/);
 assert.match(hudSource,/Pawn->GetStaminaRatio\(\)/);
 assert.match(hudSource,/Pawn->bSprinting/);
 assert.match(hudSource,/Pawn->Health/);
 assert.match(hudSource,/DrawRect\(/);
 assert.match(hudSource,/DrawText\(/);
 assert.doesNotMatch(hudSource,/WebBrowser|FHttp|EnemyLocation|GetAllActorsOfClass/);
});
