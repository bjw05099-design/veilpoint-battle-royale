'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Story=require('../src/story-slice.js');
const root=path.resolve(__dirname,'../Unreal/Veilpoint/Source/Veilpoint');
const cpp=fs.readFileSync(path.join(root,'VPWorldBootstrap.cpp'),'utf8');
const h=fs.readFileSync(path.join(root,'VPWorldBootstrap.h'),'utf8');
test('UE5 native story creates a separate three-lamp public street circuit with local physical pools',()=>{
 assert.match(h,/TArray<TObjectPtr<UPointLightComponent>> StoryPublicStreetLamps/);
 const create=cpp.slice(cpp.indexOf('void AVPWorldBootstrap::CreateStoryHarborLamps()'),
  cpp.indexOf('void AVPWorldBootstrap::SyncStoryHarborLamps()'));
 for(const p of ['FVector(-1100.f,1200.f,330.f)',
  'FVector(0.f,1000.f,340.f)','FVector(1350.f,1250.f,330.f)'])
  assert.ok(create.includes(p),p);
 assert.match(create,/UPointLightComponent\* Street=NewObject<UPointLightComponent>\(this\)/);
 assert.match(create,/Street->SetupAttachment\(RootComponent\)/);
 assert.match(create,/Street->SetAttenuationRadius\(750.f\)/);
 assert.match(create,/Street->RegisterComponent\(\)/);
 assert.match(create,/StoryPublicStreetLamps.Add\(Street\)/);
 assert.doesNotMatch(create,/SpawnActor|PlayerController|Weapon|GetInput/);
});
test('replicated CH01 mission stage switches public grid off; local relay never re-powers it',()=>{
 const sync=cpp.slice(cpp.indexOf('void AVPWorldBootstrap::SyncStoryHarborLamps()'),
  cpp.indexOf('void AVPWorldBootstrap::Tick('));
 assert.match(sync,/const bool bPowered=State && State->StoryStage!=EVPStoryStage::RestoreRelay/);
 assert.match(sync,/const bool bPublicGridPowered=State && State->StoryStage==EVPStoryStage::RestoreRelay/);
 assert.match(sync,/StoryPublicStreetLamps/);
 assert.match(sync,/Street->SetVisibility\(bPublicGridPowered\)/);
 assert.match(sync,/Lamp->SetVisibility\(bPowered\)/);
 assert.doesNotMatch(sync,/GetFirstPlayerController|WasInputKeyJustPressed|ForceNetUpdate|SetActorLocation/);
 const pre=Story.createState();
 assert.equal(pre.world.publicStreetPowered,true);
 pre.world.player.x=Story.POINTS.terminal.x;pre.world.player.z=Story.POINTS.terminal.z;
 assert.equal(Story.interact(pre).phase,'engagement');
 assert.equal(pre.world.publicStreetPowered,false);
 assert.equal(Story.restore(Story.serialize(pre)).world.publicStreetPowered,false);
});
test('native BR world never spawns story public or harbor lamps',()=>{
 const begin=cpp.slice(cpp.indexOf('void AVPWorldBootstrap::BeginPlay()'));
 const branch=begin.indexOf('if(IsA(AVPStoryWorldBootstrap::StaticClass()))');
 const end=begin.indexOf('return; // Story preview never spawns the random BR loot pool');
 assert.ok(branch>=0&&end>branch);
 assert.ok(begin.slice(branch,end).includes('CreateStoryHarborLamps()'));
 assert.ok(begin.indexOf('static const FVector2D Centers[]')>end);
});
