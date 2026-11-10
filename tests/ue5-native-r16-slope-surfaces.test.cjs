'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const native=fs.readFileSync(path.join(__dirname,
 '../Unreal/Veilpoint/Source/Veilpoint/VPCityTerrainStreamActor.cpp'),'utf8');

// Independent numeric reference for the same physical sampling units.
// Pure synthetic samples: no guessed real Aden height source is involved.
const SPACING_CM=51200/504;
function heightCm(raw,midpointMetres=0,quantizationMetres=.25){
 return (midpointMetres+(raw-32768)*quantizationMetres)*100;
}
function slopeAt(get,col,row,step=8){
 const l=Math.max(0,col-step),r=Math.min(504,col+step),
   b=Math.max(0,row-step),t=Math.min(504,row+step);
 const dx=(heightCm(get(r,row))-heightCm(get(l,row)))/
   ((r-l)*SPACING_CM);
 const dy=(heightCm(get(col,t))-heightCm(get(col,b)))/
   ((t-b)*SPACING_CM);
 return Math.hypot(dx,dy);
}
function coverage(grade){return Math.max(0,Math.min(1,(grade-.32)/.95));}

test('native R16 terrain uses measured physical rise/run rather than elevation alone to colour actual vertices',()=>{
 const pos=native.indexOf('const float RisePerRun='),
   col=native.indexOf('Colors.Add(LowGround*(1.f-RockCoverage)');
 assert.ok(pos>0&&col>pos);
 assert.match(native,/const float RisePerRun=FMath::Sqrt\(Dx\*Dx\+Dy\*Dy\)/);
 assert.match(native,/\(RisePerRun-0\.32f\)\/0\.95f/);
 assert.match(native,/FLinearColor ExposedRock\(\.42f,\.36f,\.32f\)/);
 assert.match(native,/Colors\.Add\(LowGround\*\(1\.f-RockCoverage\)\+/);
 assert.match(native,/Normals\.Add\(FVector\(-Dx,-Dy,1\.f\)\.GetSafeNormal\(\)\)/);
 assert.ok(native.indexOf('MatchingEdgeR16')<native.indexOf('CreateMeshSection_LinearColor'),
  'unverified seams must never become walkable/visible native collider surfaces');
});

test('flat civic courtyards keep sand surface while synthetic inclined ridge exposes stone',()=>{
 const flat=()=>32768;
 const raised=(x,y)=>32768+Math.round(x*4); // 1 m rise per ~1.016 m run
 const flatGrade=slopeAt(flat,252,252),steep=slopeAt(raised,252,252);
 assert.equal(flatGrade,0);
 assert.equal(coverage(flatGrade),0);
 assert.ok(steep>.90&&steep<1.04);
 assert.ok(coverage(steep)>.60&&coverage(steep)<.80);
 assert.equal(coverage(1.4),1);
 assert.ok(coverage(.5)>0&&coverage(.5)<1);
});
test('R16 first and last edge derivatives use their true 8-sample span',()=>{
 const rising=(x,y)=>32768+Math.round(y*2); // 0.5m vertical per ~1m horizontal
 const inner=slopeAt(rising,252,252),first=slopeAt(rising,252,0),
   last=slopeAt(rising,252,504);
 assert.ok(inner>.48&&inner<.52);
 assert.ok(Math.abs(inner-first)<1e-8);
 assert.ok(Math.abs(inner-last)<1e-8);
 assert.equal(heightCm(32768),0);
 assert.equal(heightCm(32772),100);
});

test('native visual colour does not bypass fixed stride, hashes, seam checks, memory cap or optional collision',()=>{
 assert.match(native,/if\(Step!=1&&Step!=2&&Step!=4&&Step!=8\)return false/);
 assert.match(native,/ReadValidatedR16\(\*Tile,Bytes\)/);
 assert.match(native,/RejectedTiles\.Add\(TileIndex\)/);
 assert.match(native,/constexpr int32 TileBudget=9/);
 assert.match(native,/bCreateTerrainCollision\?\s*ECollisionEnabled::QueryAndPhysics/);
 assert.match(native,/Mesh->CreateMeshSection_LinearColor/);
 assert.doesNotMatch(native,/real[-_ ]?Aden[-_ ]?survey[-_ ]?complete/i);
});
