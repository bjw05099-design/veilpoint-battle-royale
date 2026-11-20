'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '../Unreal/Veilpoint/Source/Veilpoint');
const source = name => fs.readFileSync(path.join(root, name), 'utf8');

test('Unreal BR takes movement from the server and publishes only the completed result to its owner', () => {
  const mode = source('VPGameMode.cpp');
  assert.match(mode, /if\(!HasAuthority\(\)\|\|bRoundComplete\)return/);
  assert.match(mode, /ReviewNextSampleAt = Now \+ 3\./);
  assert.match(mode, /ObserveRoundReview\(ElapsedMs, bSample, bRoundComplete, Living\)/);

  const character = source('VPCharacter.cpp');
  assert.match(character, /DOREPLIFETIME_CONDITION\(AVPCharacter, OwnRoundReview, COND_OwnerOnly\)/);
  assert.match(character, /DOREPLIFETIME_CONDITION\(AVPCharacter, OwnRoundPlacement, COND_OwnerOnly\)/);
  assert.doesNotMatch(character, /DOREPLIFETIME\(AVPCharacter, (Own|Pending)RoundReview\)/);
  const recording = character.slice(character.indexOf('void AVPCharacter::ObserveRoundReview'),
      character.indexOf('void AVPCharacter::SetupPlayerInputComponent'));
  assert.match(recording, /if \(!HasAuthority\(\)/);
  assert.match(recording, /GetActorLocation\(\)/);
  assert.match(recording, /bFinalPoint = !IsAlive\(\) \|\| bComplete/);
  assert.match(recording, /if \(bComplete\)\s*\{\s*OwnRoundReview = MoveTemp\(PendingRoundReview\)/);
  assert.match(recording, /PendingRoundPlacement = IsAlive\(\) \? 1 : Survivors \+ 1/);
  assert.match(recording, /OwnRoundPlacement = PendingRoundPlacement/);
  assert.doesNotMatch(source('VPCharacter.h'), /UFUNCTION\(Server[^)]*\)\s*void ObserveRoundReview/);
});

test('Unreal match HUD opens the review only after authoritative round completion', () => {
  const hud = source('VPHUD.cpp');
  assert.match(hud, /bReviewAvailable = RoundState && RoundState->bRoundComplete/);
  assert.match(hud, /if \(bReviewAvailable\)[\s\S]+?DrawRoundReview\(Pawn, Scale\)/);
  const review = hud.slice(hud.indexOf('void AVPHUD::DrawRoundReview'));
  assert.match(review, /Pawn->GetRoundReview\(\)/);
  assert.match(review, /Milliseconds \/ 1000\./);
  assert.doesNotMatch(review, /TActorIterator|GetAllActors|Lerp\(/);
});
