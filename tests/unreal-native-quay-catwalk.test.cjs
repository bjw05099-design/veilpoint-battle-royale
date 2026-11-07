'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const native=fs.readFileSync(path.resolve(__dirname,
 '../Unreal/Veilpoint/Source/Veilpoint/VPWorldBootstrap.cpp'),'utf8');
const begin=native.indexOf('// Native BR observation deck:');
const end=native.indexOf('// Native UE5 west quay:',begin);
const section=native.slice(begin,end);
const abs=Math.abs;
test('UE5 BR has a physical elevated walkway, rails and support columns in native branch',()=>{
 assert.ok(begin>0&&end>begin);
 assert.match(native,/Buildings->SetCollisionEnabled\(ECollisionEnabled::QueryAndPhysics\)/);
 assert.match(native,/Buildings->SetCollisionResponseToChannel\(ECC_Visibility,ECR_Block\)/);
 const parts=[...section.matchAll(/AddBlock\(Buildings,FVector\(([-\d.]+)f,([-\d.]+)f,([-\d.]+)f\),FVector\(([-\d.]+)f,([-\d.]+)f,([-\d.]+)f\)\)/g)]
  .map(m=>m.slice(1).map(Number));
 assert.equal(parts.length,7,'one deck, two physical rails and four support columns');
 const deck=parts[0];
 assert.deepEqual(deck,[-3500,11900,220,4,22,.3]);
 const [left,right]=parts.slice(1,3);
 assert.deepEqual([left[0],right[0]],[-3720,-3280]);
 assert.ok(deck[3]*100>=400,'walkway must have space for a standing capsule');
 for(const col of parts.slice(3)){
  assert.ok(abs(col[0]-deck[0])<180);
  assert.ok(col[1]>=10800&&col[1]<=13000);
  assert.ok(col[2]+col[5]*50>=deck[2]-deck[5]*50-1,'column meets underside');
 }
 assert.equal(native.indexOf('// Native BR observation deck:')>native.indexOf('static const FVector2D Centers[] ='),true,
  'native CH01 cannot inherit unrelated BR catwalk');
});
test('ramp has finite walkable slope and continuous ground-to-deck contact',()=>{
 const match=section.match(/AddInstance\(FTransform\(FRotator\(0\.f,0\.f,([\d.]+)f\),\s*FVector\(([-\d.]+)f,([-\d.]+)f,([-\d.]+)f\),FVector\(([-\d.]+)f,([-\d.]+)f,([-\d.]+)f\)\)\)/);
 assert.ok(match,'native sloped instanced collision mesh must exist');
 const [degrees,x,y,z,w,len,thickness]=match.slice(1).map(Number);
 assert.equal(x,-3500);
 assert.ok(degrees>5&&degrees<20,'gentle uninterrupted walkable slope');
 assert.ok(w>=3.5&&len>=14&&thickness>=.18);
 const slope=degrees*Math.PI/180;
 const halfRise=(len*100/2)*Math.sin(slope);
 const halfRun=(len*100/2)*Math.cos(slope);
 const upperY=y+halfRun,lowerY=y-halfRun;
 const lowerTop=z-halfRise+thickness*50*Math.cos(slope);
 const upperTop=z+halfRise+thickness*50*Math.cos(slope);
 // Native ground top: -70 + 1.3*50 = -5cm.
 assert.ok(abs(lowerTop-(-5))<15,'ramp must meet existing world floor without a jump');
 const deckTop=220+.3*50;
 assert.ok(abs(upperTop-deckTop)<15,'upper ramp must join actual walkway');
 assert.ok(upperY>=10750&&upperY<=10850,'ramp touches the deck southern edge');
 assert.ok(lowerY>=9300&&lowerY<=9500,'approach begins on reachable flat terrain');
});
test('raised deck does not create an opaque ground-wall or modify existing arena game rules',()=>{
 assert.doesNotMatch(section,/SetActorLocation|Telepor|SpawnActor|PlayerStart|DestroyActor|DisableCollision/);
 assert.equal((section.match(/AddInstance\(FTransform/g)||[]).length,1);
 assert.equal((section.match(/AddBlock\(Ground/g)||[]).length,0);
 assert.match(native,/if\(HasAuthority\(\)\)/);
 const game=fs.readFileSync(path.resolve(__dirname,'../src/simulation.js'),'utf8');
 assert.doesNotMatch(game,/elevated.*teleport/i);
});
