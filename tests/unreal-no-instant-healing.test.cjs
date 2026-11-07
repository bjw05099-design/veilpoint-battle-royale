'use strict';
// Unreal native source contracts. These cannot substitute for UBT/PIE.
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'../Unreal/Veilpoint/Source/Veilpoint');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
test('UE5 native world cannot manufacture instant health through a collectible',()=>{
 const world=read('VPWorldBootstrap.cpp'),character=read('VPCharacter.cpp');
 const pickup=read('VPPickup.h');
 assert.match(world,/for\(int32 i=0;i<18;\+\+i\)/);
 assert.match(world,/if\(P\)P->Resource=TEXT\("charges"\)/);
 assert.match(world,/FVector\(10800\.f,-12100\.f,110\.f\)/);
 assert.match(world,/FVector\(14400\.f,-12100\.f,110\.f\)/);
 assert.doesNotMatch(world,/TEXT\("health"\)/);
 assert.match(pickup,/FName Resource = TEXT\("charges"\)/);
 const collect=character.slice(character.indexOf('bool AVPCharacter::CollectResource'));
 assert.doesNotMatch(collect,/TEXT\("health"\)|Health\s*=|Health\s*\+=/);
 assert.match(collect,/if \(Resource==TEXT\("charges"\)/);
 assert.match(character,/if \(!bNeedSupplies\) continue;/);
});
test('UE5 still requires a direct physical and visible supply interaction',()=>{
 const source=read('VPPickup.cpp');
 assert.match(source,/HasAuthority\(\)/);
 assert.match(source,/FVector::DistSquared\(/);
 assert.match(source,/FMath::Square\(275\.f\)/);
 assert.match(source,/LineTraceTestByChannel/);
 assert.match(source,/if \(!Character->CollectResource\(Resource\)\) return;/);
 assert.match(source,/bConsumed=true;/);
});
