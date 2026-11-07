'use strict';
// Source-backed native 100cm/metre geometry contract. UE5 binary build needs Windows editor.
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const code=fs.readFileSync(path.resolve(__dirname,
 '../Unreal/Veilpoint/Source/Veilpoint/VPWorldBootstrap.cpp'),'utf8');
function room(){
 const start=code.indexOf('// A genuinely ENTERABLE CH01 warehouse');
 // Keep the original warehouse contract independent of later added
 // authored CH01 sites; the arcade has a separate full collision test.
 const arcadeStart=code.indexOf('// Native CH01 open-sided coastal trading arcade',start);
 const end=arcadeStart>start?arcadeStart:
  code.indexOf('// Ordered, deterministic harbor-edge decoration',start);
 assert.ok(start>0&&end>start,'native warehouse must be a story-specific physical world branch');
 const body=code.slice(start,end);
 const expr=/AddBlock\(Buildings,FVector\(([-\d.]+)f,([-\d.]+)f,([-\d.]+)f\),FVector\(([-\d.]+)f,([-\d.]+)f,([-\d.]+)f\)\)/g;
 const parts=[...body.matchAll(expr)].map(m=>{
  const [x,y,z,w,d,h]=m.slice(1).map(Number);
  return {x,y,z,w:w*100,d:d*100,h:h*100};
 });
 return {body,parts};
}
function collidesAt(x,y,blocks,r=45){
 return blocks.some(o=>o.z<350&&
  Math.abs(x-o.x)<o.w/2+r&&Math.abs(y-o.y)<o.d/2+r);
}
test('UE5 CH01 industrial room is a walk-in building with individually collidable walls',()=>{
 const {body,parts}=room();
 assert.equal(parts.length,9,'two sides, back, split entrance, roof and three fixtures');
 const west=parts.find(o=>o.x===1600&&o.y===3500);
 const east=parts.find(o=>o.x===3000&&o.y===3500);
 const roof=parts.find(o=>o.x===2300&&o.y===3500&&o.z===390);
 assert.ok(west&&east&&roof);
 assert.ok(roof.z-roof.h/2>=375,'roof may not obstruct floor-level passage');
 assert.ok(west.h>=375&&east.h>=375,'room walls must be physical height');
 assert.match(body,/raised roof/);
 assert.match(code,/Buildings->SetCollisionEnabled\(ECollisionEnabled::QueryAndPhysics\)/);
 // Path from the outdoors through the real 3m door to the indoor aisle.
 for(let y=2650;y<=3800;y+=25)
  assert.equal(collidesAt(2300,y,parts),false,'doorway and central aisle must be traversable at '+y);
 assert.equal(collidesAt(1850,2900,parts),true,'split entrance wall must remain solid');
 assert.equal(collidesAt(2725,2900,parts),true);
 assert.equal(collidesAt(1585,3400,parts),true);
 assert.equal(collidesAt(3000,3400,parts),true);
});
test('native room does not enclose any of the eight authored CH01 objective fixtures',()=>{
 const {parts}=room();
 const markers=[[650,0],[650,-650],[1700,-500],[1700,500],
  [2800,-400],[2800,400],[4600,-1400],[4600,1400]];
 for(const [x,y] of markers)
  assert.equal(collidesAt(x,y,parts,145),false,'an E-action marker must stay physically accessible');
 const storyBranch=code.indexOf('if(IsA(AVPStoryWorldBootstrap::StaticClass()))');
 const nativeBRBranch=code.indexOf('static const FVector2D Centers[] =');
 const roomAt=code.indexOf('// A genuinely ENTERABLE CH01 warehouse');
 assert.ok(storyBranch<roomAt&&roomAt<nativeBRBranch);
});
test('two interior fixtures are visible UE5 point lights bound to real restored relay state',()=>{
 assert.match(code,/FVector\(2050\.f,3450\.f,305\.f\)/);
 assert.match(code,/FVector\(2550\.f,3450\.f,305\.f\)/);
 assert.match(code,/SyncStoryHarborLamps\(\);/);
 assert.match(code,/State->StoryStage!=EVPStoryStage::RestoreRelay/);
 assert.match(code,/CreateStoryHarborLamps\(\);\s*SetActorTickEnabled\(true\)/);
});
