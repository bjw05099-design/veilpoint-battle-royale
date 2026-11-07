'use strict';
// Native Unreal survival integration gate. GitHub Node CI checks contracts
// but cannot substitute for compiling and playing a Windows UE5 build.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..','Unreal','Veilpoint','Source','Veilpoint');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const header=read('VPCharacter.h');
const character=read('VPCharacter.cpp');
const pickup=read('VPPickup.cpp');
const world=read('VPWorldBootstrap.cpp');

test('native survival contains no arcade shield pool or simulated armor replenishment',()=>{
 assert.doesNotMatch(header,/\bShield\b/);
 assert.doesNotMatch(character,/\bShield\b|Resource\s*==\s*TEXT\("armor"\)/);
 assert.doesNotMatch(world,/TEXT\("armor"\)/);
 assert.match(character,/Health = FMath::Max\(0\.f, Health - Amount\)/);
 assert.match(character,/FMath::IsFinite\(Incoming\)/,
   'invalid damage input must not pollute authoritative health');
 assert.match(character,/if \(!HasAuthority\(\) \|\| !IsAlive\(\)\) return 0\.f;/);
});

test('native finite supplies are consumed only if physical transfer succeeds',()=>{
 assert.match(header,/bool CollectResource\(FName Resource\)/);
 assert.match(character,/bool AVPCharacter::CollectResource\(FName Resource\)/);
 assert.match(character,/if \(!HasAuthority\(\) \|\| !IsAlive\(\)\) return false/);
 assert.doesNotMatch(character,/Resource==TEXT\("health"\)/);
 assert.match(character,/Resource==TEXT\("charges"\) && Charges < 60/);
 assert.match(character,/return false;\s*\}/);
 assert.match(pickup,/if \(!Character->CollectResource\(Resource\)\) return;\s*bConsumed=true;\s*Destroy\(\)/);
 assert.doesNotMatch(pickup,/bConsumed\s*=\s*true;\s*Character->CollectResource\(/);
});

test('native world generates valid resource types only with consistent finite distribution',()=>{
 assert.match(world,/for\(int32 i=0;i<18;\+\+i\)/);
 assert.match(world,/if\(P\)P->Resource=TEXT\("charges"\)/);
 assert.doesNotMatch(character,/Health=FMath::Min\(100\.f,Health\+45\.f\)/);
 assert.match(character,/Charges=FMath::Min\(60,Charges\+24\)/);
 assert.match(pickup,/HasAuthority\(\) \|\| bConsumed/);
 assert.match(pickup,/FVector::DistSquared/);
});
