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
  assert.match(review, /ReviewPlayheadMs \/ 1000\./);
  assert.match(review, /WasInputKeyJustPressed\(EKeys::T\)[\s\S]*?ReviewPlaybackStartMs = ReviewPlayheadMs[\s\S]*?RoundReviewRateIndex =/);
  assert.match(review, /if \(Cursor < Last && !bGap\)[\s\S]*?VPRoundReview::Fraction\(ReviewPlayheadMs/);
  assert.match(review, /bSkip[\s\S]*?VPRoundReview::SkipMs/);
  assert.doesNotMatch(review, /TActorIterator|GetAllActors/);
});


test('native Battle Royale overview displays public world geometry, its zone and only the local player', () => {
  const body = source('VPBRFieldMap.cpp');
  const world = source('VPWorldBootstrap.cpp');
  const controls = source('VPHUD.cpp');
  assert.match(world, /Ground->GetInstanceTransform\(0, Terrain, true\)[\s\S]*?Buildings->GetInstanceTransform\(Id, Block, true\)/);
  assert.match(body, /GetPublicOverview\(BRMapBounds, BRMapBuildings\)/);
  assert.match(body, /Zone\.ZoneCenter[\s\S]*?Zone\.Radius/);
  assert.match(body, /GetLocalFieldMark[\s\S]*?Pawn\.GetActorLocation\(\)/);
  assert.doesNotMatch(body, /PlayerArray|TActorIterator<AVPCharacter>|VPPickup/);
  assert.match(controls, /WasInputKeyJustPressed\(EKeys::M\)[\s\S]*?bBRFieldMapOpen = !bBRFieldMapOpen/);
});
