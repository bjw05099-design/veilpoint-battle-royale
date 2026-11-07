'use strict';
// Unreal C++ source-level feature gate. GitHub Node cannot compile UE5;
// actual PIE lighting and Windows native packaging remain unverified.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../Unreal/Veilpoint/Source/Veilpoint');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const world=read('VPWorldBootstrap.cpp');
const header=read('VPWorldBootstrap.h');
const story=read('VPStoryGameState.cpp');

test('native CH01 creates three spatially authored wall lamps, not an omniscient glow',()=>{
 assert.match(header,/TArray<TObjectPtr<UPointLightComponent>> StoryHarborLamps/);
 const create=world.slice(world.indexOf('void AVPWorldBootstrap::CreateStoryHarborLamps()'),
  world.indexOf('void AVPWorldBootstrap::SyncStoryHarborLamps()'));
 assert.match(create,/IsA\(AVPStoryWorldBootstrap::StaticClass\(\)\)/);
 for(const xyz of [
  'FVector(1250.f,-950.f,350.f)',
  'FVector(2050.f,950.f,350.f)',
  'FVector(3550.f,-1700.f,330.f)'
 ])assert.ok(create.includes(xyz),xyz);
 assert.match(create,/NewObject<UPointLightComponent>\(this\)/);
 assert.match(create,/Lamp->SetupAttachment\(RootComponent\)/);
 assert.match(create,/Lamp->SetAttenuationRadius\(900.f\)/);
 assert.match(create,/Lamp->SetVisibility\(false\)/);
 assert.match(create,/Lamp->RegisterComponent\(\)/);
 assert.doesNotMatch(create,/SpawnActor|GetAllActorsOfClass|Enemy|Bot|Hidden/);
});
test('native lamp power follows replicated mission progress, not client keys or renderer FPS',()=>{
 const sync=world.slice(world.indexOf('void AVPWorldBootstrap::SyncStoryHarborLamps()'),
   world.indexOf('void AVPWorldBootstrap::Tick('));
 assert.match(sync,/GetGameState<AVPStoryGameState>\(\)/);
 assert.match(sync,/State->StoryStage!=EVPStoryStage::RestoreRelay/);
 assert.match(sync,/Lamp->SetVisibility\(bPowered\)/);
 assert.doesNotMatch(sync,/GetFirstPlayerController|GetInput|WasInputKeyJustPressed|ForceNetUpdate|SetActorLocation/);
 assert.match(story,/DOREPLIFETIME\(AVPStoryGameState, StoryStage\)/);
 assert.match(story,/StoryStage = Stage/);
 const tick=world.slice(world.indexOf('void AVPWorldBootstrap::Tick('),
  world.indexOf('void AVPWorldBootstrap::BeginPlay()'));
 assert.match(tick,/IsA\(AVPStoryWorldBootstrap::StaticClass\(\)\)/);
 assert.match(tick,/SyncStoryHarborLamps\(\)/);
 assert.match(world,/PrimaryActorTick\.TickInterval=\.25f/);
 assert.match(world,/PrimaryActorTick\.bStartWithTickEnabled=false/);
});
test('existing BR and CH01 level boundaries remain distinct with no duplicated world generation',()=>{
 const begin=world.slice(world.indexOf('void AVPWorldBootstrap::BeginPlay()'));
 const start=begin.indexOf('if(IsA(AVPStoryWorldBootstrap::StaticClass()))');
 const end=begin.indexOf('return; // Story preview never spawns the random BR loot pool');
 assert.ok(start>=0&&end>start);
 const storyWorld=begin.slice(start,end);
 assert.match(storyWorld,/CreateStoryHarborLamps\(\)/);
 assert.match(storyWorld,/SetActorTickEnabled\(true\)/);
 assert.doesNotMatch(storyWorld,/GetGameState<AVPStoryGameState>\(\)/,
  'blockout must be chosen by class, not by delayed replicated stage');
 assert.ok(begin.indexOf('static const FVector2D Centers[]')>end,
  'BR remains an independent seeded geometry world without CH01 lamps');
});
