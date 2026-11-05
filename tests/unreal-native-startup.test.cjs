'use strict';
// Unreal Windows startup source contracts only. PIE/Win64 launch is NOT part
// of GitHub's Node CI and still requires an installed compatible UE editor.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..','Unreal','Veilpoint');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const modeHeader=read('Source/Veilpoint/VPGameMode.h');
const mode=read('Source/Veilpoint/VPGameMode.cpp');
const engine=read('Config/DefaultEngine.ini');
const bootstrap=read('Source/Veilpoint/VPWorldBootstrap.cpp');

test('UE5 PC default Entry map binds actual game mode, player pawn and native HUD',()=>{
 assert.match(engine,/GlobalDefaultGameMode=\/Script\/Veilpoint\.VPGameMode/);
 assert.match(engine,/GameDefaultMap=\/Engine\/Maps\/Entry/);
 assert.match(mode,/DefaultPawnClass=AVPCharacter::StaticClass\(\)/);
 assert.match(mode,/HUDClass=AVPHUD::StaticClass\(\)/);
});

test('UE5 GameMode only creates fallback starts when there is no authored PlayerStart',()=>{
 assert.match(modeHeader,/ChoosePlayerStart_Implementation\(AController\* Player\) override/);
 assert.match(mode,/#include "GameFramework\/PlayerStart.h"/);
 const body=mode.slice(mode.indexOf('AActor* AVPGameMode::ChoosePlayerStart_Implementation'),
   mode.indexOf('void AVPGameMode::BeginPlay'));
 assert.match(body,/if \(AActor\* Existing=Super::ChoosePlayerStart_Implementation\(Player\)\)\s*return Existing/);
 assert.match(body,/if \(!HasAuthority\(\) \|\| !GetWorld\(\)\) return nullptr/);
 assert.match(body,/SpawnCollisionHandlingOverride=ESpawnActorCollisionHandlingMethod::AlwaysSpawn/);
 assert.match(body,/GetWorld\(\)->SpawnActor<APlayerStart>/);
 assert.match(body,/return Super::ChoosePlayerStart_Implementation\(Player\)/);
});

test('UE5 empty-map fallback positions are finite, above ground and placed in the clear central yard',()=>{
 const body=mode.slice(mode.indexOf('const FVector SafeStarts[]'),mode.indexOf('FActorSpawnParameters Params'));
 const spots=[...body.matchAll(/FVector\((-?\d+)\.f,(-?\d+)\.f,(\d+)\.f\)/g)].map(m=>m.slice(1).map(Number));
 assert.equal(spots.length,4,'four distinct authored default positions');
 assert.equal(new Set(spots.map(p=>p.join(','))).size,4);
 for(const [x,y,z] of spots){
   assert.ok(Number.isFinite(x)&&Number.isFinite(y)&&Number.isFinite(z));
   assert.ok(Math.abs(x)<=1000&&Math.abs(y)<=1000,'keep within reserved clear native center');
   assert.ok(z>=100&&z<=250,'avoid starting inside the floor');
 }
 assert.match(bootstrap,/AddBlock\(Ground,FVector\(0,0,-70\),FVector\(350\.f,350\.f,1\.3f\)\)/);
});

test('UE5 GameMode preserves authority-only environment bootstrap and does not spawn arbitrary client-owned starts',()=>{
 assert.match(mode,/if\(HasAuthority\(\)\)[\s\S]*?SpawnActor<AVPWorldBootstrap>/);
 assert.doesNotMatch(mode,/Player->GetActorLocation\(\)|ClientSpawn|ClientChooseStart/);
});
