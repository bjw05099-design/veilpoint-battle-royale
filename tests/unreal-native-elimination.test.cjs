'use strict';
// Unreal source-only safety regression: real UE build / Win64 network PIE
// remains necessary before claiming executable character behavior.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const dir=path.resolve(__dirname,'..','Unreal','Veilpoint','Source','Veilpoint');
const header=fs.readFileSync(path.join(dir,'VPCharacter.h'),'utf8');
const source=fs.readFileSync(path.join(dir,'VPCharacter.cpp'),'utf8');
const hud=fs.readFileSync(path.join(dir,'VPHUD.cpp'),'utf8');

test('elimination replicates from authority and runs a client OnRep callback',()=>{
 assert.match(header,/UPROPERTY\(ReplicatedUsing=OnRep_Eliminated, BlueprintReadOnly, Category="Survival"\)/);
 assert.match(header,/UFUNCTION\(\)\s*void OnRep_Eliminated\(\)/);
 assert.match(source,/DOREPLIFETIME\(AVPCharacter, bEliminated\)/);
 assert.match(source,/void AVPCharacter::OnRep_Eliminated\(\)/);
 assert.match(source,/if \(!bEliminated\) return/);
});

test('eliminated local and remote clients both stop movement and sprint before further action',()=>{
 const callback=source.slice(source.indexOf('void AVPCharacter::OnRep_Eliminated()'),
   source.indexOf('void AVPCharacter::ApplySprintSpeed()'));
 assert.match(callback,/bSprintHeld = false/);
 assert.match(callback,/bSprinting = false/);
 assert.match(callback,/ApplySprintSpeed\(\)/);
 assert.match(callback,/StopMovementImmediately\(\)/);
 assert.match(callback,/DisableMovement\(\)/);
 const damage=source.slice(source.indexOf('float AVPCharacter::TakeDamage('),
   source.indexOf('void AVPCharacter::TryTag()'));
 assert.match(damage,/if \(!HasAuthority\(\) \|\| !IsAlive\(\)\) return 0\.f/);
 assert.match(damage,/if \(Health <= 0\.f\)[\s\S]*?bEliminated = true;[\s\S]*?OnRep_Eliminated\(\)/);
 assert.doesNotMatch(damage,/GetCharacterMovement\(\)->DisableMovement\(\)/);
});

test('native crouch, sprint, camera and movement inputs reject eliminated pawns',()=>{
 assert.match(source,/void AVPCharacter::BeginCrouch\(\) \{ if \(IsAlive\(\)\) Crouch\(\); \}/);
 assert.match(source,/void AVPCharacter::EndCrouch\(\) \{ if \(IsAlive\(\)\) UnCrouch\(\); \}/);
 assert.match(source,/void AVPCharacter::BeginSprint\(\)[\s\S]*?if \(!IsAlive\(\)\) return;/);
 assert.match(source,/void AVPCharacter::ServerSetSprintHeld_Implementation\(bool bHeld\)[\s\S]*?bSprintHeld = bHeld && IsAlive\(\)/);
 assert.match(source,/void AVPCharacter::MoveForward\(float Value\)[\s\S]*?if \(IsAlive\(\) && Controller\)/);
 assert.match(source,/void AVPCharacter::MoveRight\(float Value\)[\s\S]*?if \(IsAlive\(\) && Controller\)/);
 assert.match(source,/void AVPCharacter::LookUp\(float Value\) \{ if \(IsAlive\(\)\)/);
 assert.match(hud,/Pawn->bEliminated/);
});
