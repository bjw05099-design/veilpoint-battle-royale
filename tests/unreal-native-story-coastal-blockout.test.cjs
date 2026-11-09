'use strict';
// UE5 C++ source preflight only. Native UBT, PIE, physics and visual geometry
// require a real Unreal 5.8 Windows build, not simulated tests.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../Unreal/Veilpoint/Source/Veilpoint');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const world=read('VPWorldBootstrap.cpp'),header=read('VPWorldBootstrap.h');
const story=read('VPStoryGameMode.cpp'),battle=read('VPGameMode.cpp');
test('native CH01 blockout uses a different replicated actor class, not an unreliable client GameState race',()=>{
 assert.match(header,/class VEILPOINT_API AVPStoryWorldBootstrap : public AVPWorldBootstrap/);
 assert.match(world,/if\(IsA\(AVPStoryWorldBootstrap::StaticClass\(\)\)\)/);
 assert.match(story,/SpawnActor<AVPStoryWorldBootstrap>/);
 assert.match(story,/AVPStoryWorldBootstrap::StaticClass\(\)/);
 assert.match(battle,/SpawnActor<AVPWorldBootstrap>/);
 // The class must decide which map to build BEFORE any potentially late
 // replicated GameState arrives. Reading GameState later for purely visual
 // fixture illumination is valid and does not make geometry timing-dependent.
 const begin=world.slice(world.indexOf('void AVPWorldBootstrap::BeginPlay()'));
 const storyBranch=begin.slice(begin.indexOf('if(IsA(AVPStoryWorldBootstrap::StaticClass()))'),
   begin.indexOf('return; // Story preview never spawns the random BR loot pool'));
 assert.doesNotMatch(storyBranch,/GetGameState<AVPStoryGameState>\(\)/);
 assert.match(world,/bReplicates=true/);
 assert.match(world,/SetReplicateMovement\(false\)/);
});
test('native CH01 blockout has physically separated record stations, two exits and an unblocked central route',()=>{
 const body=world.slice(world.indexOf('static const FCoastalBlock StoryBlocks[]'),world.indexOf('for(const FCoastalBlock& Block'));
 const matches=[...body.matchAll(/\{FVector\(([-.\d]+)f,([-.\d]+)f,([-.\d]+)f\), FVector\(([-.\d]+)f,([-.\d]+)f,([-.\d]+)f\)\}/g)];
 assert.equal(matches.length,16,'fourteen existing blocks plus two authored east public gate shoulders');
 const blocks=matches.map(m=>m.slice(1).map(Number));
 // Check both added structures instead of merely accepting an enlarged count:
 // gate location is an original fictional public passage, not a real target.
 assert.ok(blocks.some(a=>a.join(',')==='4050,600,145,0.4,10,2.9'));
 assert.ok(blocks.some(a=>a.join(',')==='4050,2200,145,0.4,10,2.9'));
 const markers=[{x:650,y:0},{x:1700,y:-500},{x:1700,y:500},
  {x:2800,y:-400},{x:2800,y:400},{x:4600,y:-1400},{x:4600,y:1400}];
 for(const marker of markers)for(const [x,y,,sx,sy] of blocks){
  // UE basic Cube is 100 cm per scale unit. Keep a margin for the
  // authored objective's 275cm local activation radius.
  const dx=Math.max(0,Math.abs(marker.x-x)-sx*50);
  const dy=Math.max(0,Math.abs(marker.y-y)-sy*50);
  assert.ok(Math.hypot(dx,dy)>275,
    'mission marker must not be embedded in or beside a solid block');
 }
 assert.match(world,/AddBlock\(Ground,FVector\(0,0,-70\)/);
 assert.match(world,/for\(int32 i=0;i<18;\+\+i\)/);
 assert.match(world,/AddBlock\(Vegetation,FVector\(X,Y,145\.f\)/);
});
test('native CH01 scenic layout is generated locally on both peers, while BR preserves its distinct resource world',()=>{
 const branch=world.indexOf('if(IsA(AVPStoryWorldBootstrap::StaticClass()))');
 const returnAt=world.indexOf('return; // Story preview never spawns the random BR loot pool',branch);
 const brCenters=world.indexOf('static const FVector2D Centers[]',returnAt);
 const brRandom=world.indexOf('FRandomStream Random(19771)',returnAt);
 const authority=world.indexOf('if(HasAuthority())',returnAt);
 const pickups=world.indexOf('SpawnActor<AVPPickup>',authority);
 assert.ok(branch>0&&returnAt>branch&&brCenters>returnAt&&brRandom>brCenters);
 assert.ok(authority>brRandom&&pickups>authority);
 assert.doesNotMatch(world.slice(branch,returnAt),/HasAuthority\(\)|SpawnActor<AVPPickup>/);
 assert.match(world.slice(branch,returnAt),/AddBlock\(Buildings,Block.Center,Block.Scale\)/);
 assert.match(world,/Ground->SetCollisionResponseToChannel\(ECC_Visibility,ECR_Block\)/);
 assert.match(world,/Buildings->SetCollisionResponseToChannel\(ECC_Visibility,ECR_Block\)/);
});
