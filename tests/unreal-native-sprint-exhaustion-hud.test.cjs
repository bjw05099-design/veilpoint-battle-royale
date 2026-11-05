'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const base=path.join(__dirname,'../Unreal/Veilpoint/Source/Veilpoint');
const read=file=>fs.readFileSync(path.join(base,file),'utf8');
const header=read('VPCharacter.h'),character=read('VPCharacter.cpp'),hud=read('VPHUD.cpp');

test('UE5 native recovery latch has exactly one server-replicated HUD-visible declaration',()=>{
  assert.match(header,/UPROPERTY\(Replicated, BlueprintReadOnly, Category="Movement\|Stamina"\)\s*bool bSprintExhausted = false;/);
  assert.equal((header.match(/bool bSprintExhausted = false/g)||[]).length,1);
  assert.match(character,/DOREPLIFETIME\(AVPCharacter, bSprintExhausted\)/);
  assert.doesNotMatch(header,/UFUNCTION\(Server.*bSprintExhausted/);
});

test('UE5 60Hz authoritative cooldown uses the finite 25-point rearm and edge-only network update',()=>{
  assert.match(character,/if \(!HasAuthority\(\) \|\| !IsAlive\(\)\) return;/);
  assert.match(character,/constexpr float FixedStep = 1\.f \/ 60\.f/);
  assert.match(character,/const bool bPreviouslyExhausted = bSprintExhausted;/);
  assert.match(character,/if \(bSprintExhausted && Stamina >= 25\.f\) bSprintExhausted = false;/);
  assert.match(character,/if \(Stamina <= 1\.e-6f\) bSprintExhausted = true;/);
  assert.match(character,/if \(bSprintExhausted != bPreviouslyExhausted\) ForceNetUpdate\(\);/);
  assert.doesNotMatch(hud,/UpdateSprintFixedStep|SprintAccumulator|SetStamina/);
});

test('UE5 native HUD prioritizes elimination and recovery before ordinary movement text',()=>{
  const source=hud.slice(hud.indexOf('const FString MovementLabel'));
  const dead=source.indexOf('Pawn->bEliminated');
  const recovery=source.indexOf('Pawn->bSprintExhausted');
  const sprint=source.indexOf('Pawn->bSprinting');
  assert.ok(dead>=0 && recovery>dead && sprint>recovery);
  assert.match(source,/MOVEMENT: STAMINA RECOVERY \(25 TO SPRINT\)/);
  assert.match(source,/DrawText\(MovementLabel/);
  assert.match(hud,/Pawn->GetStaminaRatio\(\)/);
  assert.doesNotMatch(source,/Date\.now|requestAnimationFrame|WebBrowser/);
});
