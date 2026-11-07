'use strict';
// Source-level geometry contract; real UE5 compiler/PIE remains a separate gate.
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const code=fs.readFileSync(path.resolve(__dirname,
 '../Unreal/Veilpoint/Source/Veilpoint/VPWorldBootstrap.cpp'),'utf8');
const start=code.indexOf('// Native CH01 open-sided coastal trading arcade');
const end=code.indexOf('// Ordered, deterministic harbor-edge decoration',start);
const body=code.slice(start,end);
const raw=[...body.matchAll(/AddBlock\(Buildings,FVector\(([-\d.]+)f,([-\d.]+)f,([-\d.]+)f\),FVector\(([-\d.]+)f,([-\d.]+)f,([-\d.]+)f\)\)/g)]
 .map(m=>m.slice(1).map(Number));
const blocks=raw.map(([x,y,z,w,d,h])=>({x,y,z,hw:w*50,hd:d*50,hh:h*50}));
const overlaps=(x,y,block,margin=45)=>Math.abs(x-block.x)<block.hw+margin &&
 Math.abs(y-block.y)<block.hd+margin;
test('Unreal CH01 physically constructs a non-replicated-instance-free arcade on all peers',()=>{
 assert.ok(start>0&&end>start);
 assert.equal(raw.length,7,'one roof, four pillars and two grounded counters');
 assert.deepEqual(raw[0],[5500,3000,320,18,7,.25]);
 assert.match(code,/Buildings->SetCollisionEnabled\(ECollisionEnabled::QueryAndPhysics\)/);
 assert.match(code,/Buildings->SetCollisionResponseToChannel\(ECC_Visibility,ECR_Block\)/);
 const begin=code.indexOf('if(IsA(AVPStoryWorldBootstrap::StaticClass()))');
 const complete=code.indexOf('return; // Story preview never spawns the random BR loot pool');
 assert.ok(start>begin&&end<complete,'arcade belongs to CH01, not BR');
 assert.doesNotMatch(body,/HasAuthority\(\)|SpawnActor|SetActorLocation|Teleport/);
});
test('physical floor entrance, interior corridor and side exits stay traversable for a human capsule',()=>{
 const roof=blocks[0],solid=blocks.slice(1);
 assert.ok(roof.z-roof.hh>=300,'overhead canopy remains clear above a walking character');
 for(let y=2500;y<=3500;y+=25){
  for(const x of [5300,5500,5700]){
   assert.equal(solid.some(b=>overlaps(x,y,b)),false,
    'middle arcade footpath must be clear at '+x+','+y);
  }
 }
 assert.ok(solid.filter(b=>b.hh>=150).length===4,'four full-height support posts');
 for(const b of solid.slice(0,4))
  assert.ok(b.z+b.hh>=roof.z-roof.hh,'roof must rest on its pillars');
 assert.ok(solid.some(b=>overlaps(4775,3000,b,0)),'left shop counter is a physical object');
 assert.ok(solid.some(b=>overlaps(6225,3000,b,0)),'right shop counter is a physical object');
});
test('old seven native objectives and CH01 warehouse remain accessible',()=>{
 const objectives=[[650,0],[1700,-500],[1700,500],[2800,-400],
 [2800,400],[4600,-1400],[4600,1400]];
 for(const [x,y] of objectives)
  for(const b of blocks.slice(1))
   assert.equal(overlaps(x,y,b,275),false,'arcade must not block a known objective');
 assert.match(code,/A genuinely ENTERABLE CH01 warehouse/);
 assert.match(code,/static const FCoastalBlock StoryBlocks\[\]/);
 const ue=code.slice(code.indexOf('void AVPWorldBootstrap::BeginPlay()'));
 assert.ok(ue.indexOf('static const FVector2D Centers[]')>ue.indexOf('return; // Story preview'));
});
