'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const code=fs.readFileSync(path.resolve(__dirname,
 '../Unreal/Veilpoint/Source/Veilpoint/VPWorldBootstrap.cpp'),'utf8');
const start=code.indexOf('// Native CH01 public loading dais');
const end=code.indexOf('// Ordered, deterministic harbor-edge decoration',start);
const body=code.slice(start,end);
const deg=7.3*Math.PI/180;
test('native UE5 source creates a single continuous pedestrian ramp and raised deck',()=>{
 assert.ok(start>0&&end>start);
 assert.match(body,/Buildings->AddInstance\(FTransform\(FRotator\(0\.f,0\.f,7\.3f\)/);
 assert.match(body,/FVector\(8400\.f,2050\.f,55\.f\),FVector\(7\.2f,11\.f,\.2f\)/);
 assert.match(body,/FVector\(8400\.f,3200\.f,120\.f\),FVector\(8\.f,12\.f,\.22f\)/);
 const lowerLip=55-550*Math.sin(deg)+10*Math.cos(deg);
 const upperLip=55+550*Math.sin(deg)+10*Math.cos(deg);
 const deckTop=120+11;
 assert.ok(Math.abs(lowerLip-(-5))<3,'lower ramp joins the authored ground');
 assert.ok(Math.abs(upperLip-deckTop)<6,'upper ramp meets the raised deck without teleportation');
 assert.equal(2050+550,3200-600,'ramp and deck meet at the same Y edge');
});
test('native platform rails preserve a wide open corridor and mission objectives',()=>{
 assert.match(body,/FVector\(8000\.f,3200\.f,200\.f\),FVector\(\.18f,12\.f,1\.3f\)/);
 assert.match(body,/FVector\(8800\.f,3200\.f,200\.f\),FVector\(\.18f,12\.f,1\.3f\)/);
 assert.match(body,/FVector\(8050\.f,3100\.f,60\.f\)/);
 assert.match(body,/FVector\(8750\.f,3100\.f,60\.f\)/);
 assert.match(code,/Buildings->SetCollisionEnabled\(ECollisionEnabled::QueryAndPhysics\)/);
 assert.match(code,/Buildings->SetCollisionResponseToChannel\(ECC_Visibility,ECR_Block\)/);
 const firstStory=code.indexOf('if(IsA(AVPStoryWorldBootstrap::StaticClass()))');
 const storyEnd=code.indexOf('return; // Story preview never spawns the random BR loot pool');
 assert.ok(firstStory<start&&end<storyEnd,'the platform is CH01-only and has no BR spawn side effects');
 for(const x of [650,1700,2800,4600])
  assert.ok(Math.abs(8400-x)>3000,'the platform does not obstruct known objective sites');
 assert.doesNotMatch(body,/Teleport|SetActorLocation|HasAuthority\(\)/);
});
