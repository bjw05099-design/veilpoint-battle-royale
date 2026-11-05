'use strict';
// These are UE5 source-contract checks. They cannot run Unreal's native
// collision system on GitHub's Node-only runner.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..','Unreal','Veilpoint','Source','Veilpoint');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const character=read('VPCharacter.cpp');
const pickup=read('VPPickup.cpp');
const world=read('VPWorldBootstrap.cpp');
const interaction=character.slice(character.indexOf('void AVPCharacter::ServerTryInteract_Implementation'),
 character.indexOf('bool AVPCharacter::CollectResource'));

test('UE5 finite item selection ignores full inventories and unknown legacy resources',()=>{
 assert.match(interaction,/if \(It->bConsumed\) continue/);
 assert.match(interaction,/It->Resource==TEXT\("health"\) && Health<100\.f/);
 assert.match(interaction,/It->Resource==TEXT\("charges"\) && Charges<60/);
 assert.match(interaction,/if \(!bNeedHealth && !bNeedSupplies\) continue/);
 assert.match(interaction,/const float d=FVector::DistSquared/);
 assert.match(interaction,/if \(d>=BestSq\) continue/);
 assert.match(interaction,/BestSq=d;\s*Nearest=\*It/);
});

test('UE5 pickup selection rejects walls before choosing the nearest reachable supply',()=>{
 const idxReject=interaction.indexOf('LineTraceTestByChannel(');
 const idxChoose=interaction.indexOf('BestSq=d;');
 assert.ok(idxReject>0 && idxChoose>idxReject,
   'occlusion must be checked before nearest candidate becomes selected');
 assert.match(interaction,/FCollisionQueryParams Params\(SCENE_QUERY_STAT\(VPInteract\),true,this\)/);
 assert.match(interaction,/Params.AddIgnoredActor\(\*It\)/);
 assert.match(interaction,/GetPawnViewLocation\(\),It->GetActorLocation\(\),ECC_Visibility,Params\)\) continue/);
 assert.doesNotMatch(interaction,/LineTraceSingleByChannel[^;]+ECC_Pawn/);
});

test('UE5 resource Claim independently enforces world occlusion and server authority',()=>{
 assert.match(pickup,/if \(!HasAuthority\(\) \|\| bConsumed \|\| !IsValid\(Character\) \|\| !Character->IsAlive\(\)\) return/);
 assert.match(pickup,/FVector::DistSquared\(GetActorLocation\(\),Character->GetActorLocation\(\)\)>FMath::Square\(275\.f\)/);
 assert.match(pickup,/if \(!GetWorld\(\)\) return/);
 assert.match(pickup,/FCollisionQueryParams Params\(SCENE_QUERY_STAT\(VPClaim\),true,Character\)/);
 assert.match(pickup,/Params.AddIgnoredActor\(this\)/);
 assert.match(pickup,/Character->GetPawnViewLocation\(\),GetActorLocation\(\),ECC_Visibility,Params\)\) return/);
 assert.match(pickup,/if \(!Character->CollectResource\(Resource\)\) return;\s*bConsumed=true;\s*Destroy\(\)/);
});

test('UE5 solid native structures block visibility while scenery decoration stays non-colliding',()=>{
 assert.match(world,/Ground->SetCollisionEnabled\(ECollisionEnabled::QueryAndPhysics\)/);
 assert.match(world,/Buildings->SetCollisionEnabled\(ECollisionEnabled::QueryAndPhysics\)/);
 assert.match(world,/Ground->SetCollisionResponseToChannel\(ECC_Visibility,ECR_Block\)/);
 assert.match(world,/Buildings->SetCollisionResponseToChannel\(ECC_Visibility,ECR_Block\)/);
 assert.match(world,/Vegetation->SetCollisionEnabled\(ECollisionEnabled::NoCollision\)/);
 assert.match(world,/FRandomStream Random\(19771\)/);
});

test('UE5 visibility validation is local server geometry, not trusted client coordinates',()=>{
 assert.match(character,/void AVPCharacter::TryInteract\(\) \{ if \(IsLocallyControlled\(\) && IsAlive\(\)\) ServerTryInteract\(\); \}/);
 assert.match(character,/void AVPCharacter::ServerTryInteract_Implementation\(\)/);
 assert.match(interaction,/if \(!IsAlive\(\) \|\| !GetWorld\(\)\) return/);
 assert.doesNotMatch(interaction,/ClientActorLocation|ClientHitResult|ClientPickupPosition|GetPlayerLocationFromClient/);
 assert.match(pickup,/GetWorld\(\)->LineTraceTestByChannel/);
});
