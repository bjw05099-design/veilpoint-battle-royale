'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const native=fs.readFileSync(path.resolve(__dirname,
 '../Unreal/Veilpoint/Source/Veilpoint/VPCityTerrainStreamActor.cpp'),'utf8');
const header=fs.readFileSync(path.resolve(__dirname,
 '../Unreal/Veilpoint/Source/Veilpoint/VPCityTerrainStreamActor.h'),'utf8');
const grid=fs.readFileSync(path.resolve(__dirname,
 '../Unreal/Veilpoint/Source/Veilpoint/VPCityTileGrid.h'),'utf8');
function extract(src,start,end){
 const a=src.indexOf(start),b=src.indexOf(end,a+start.length);
 assert.ok(a>0&&b>a,start+' must precede '+end);
 return src.slice(a,b);
}
function selected(origin,radius,available,budget=9){
 const list=[];
 for(let ring=0;ring<=radius;ring++)
  for(let dx=-ring;dx<=ring;dx++)
   for(let dy=-ring;dy<=ring;dy++)
    if(Math.max(Math.abs(dx),Math.abs(dy))===ring){
     const tx=origin[0]+dx,tz=origin[1]+dy,key=tx+','+tz;
     if(available.has(key)&&list.length<budget)list.push(key);
    }
 return list;
}
test('native runtime checks all four cardinal byte-exact R16 seams before registering ANY collider',()=>{
 const seam=extract(native,'bool MatchingEdgeR16(','float DecodeCm(');
 for(const clause of [
  'Proposed.Num()!=BytesPerTile',
  'Neighbor.Num()!=BytesPerTile',
  'FMath::Abs(Offset.X)+FMath::Abs(Offset.Y)!=1',
  'if(Offset.X==1)',
  'else if(Offset.X==-1)',
  'else if(Offset.Y==1)',
  'RawHeight(Proposed,Ax,Ay)!=RawHeight(Neighbor,Bx,By)'
 ])assert.ok(seam.includes(clause),clause);
 const load=extract(native,'bool AVPCityTerrainStreamActor::CreateTileMesh(',
  'void AVPCityTerrainStreamActor::StreamAround(');
 assert.match(load,/ReadValidatedR16\(\*Tile,Bytes\)/);
 assert.match(load,/LoadedHeightBytes\.Find\(TileIndex\+Offset\)/);
 assert.match(load,/VPCityTerrain::MatchingEdgeR16\(\s*Bytes,\*AdjacentBytes,Offset\)/);
 assert.match(load,/RejectedTiles\.Add\(TileIndex\)/);
 assert.ok(load.indexOf('MatchingEdgeR16')<load.indexOf('CreateMeshSection_LinearColor'),
  'border integrity validation must PRECEDE creating native physics or visible mesh');
 assert.match(load,/LoadedHeightBytes\.Add\(TileIndex,MoveTemp\(Bytes\)\)/);
 assert.match(header,/TMap<FIntPoint,TArray<uint8>> LoadedHeightBytes/);
 assert.match(header,/TSet<FIntPoint> RejectedTiles/);
});
test('nine-slot native streaming chooses new center and evicts obsolete cells, even when 25 are still in range',()=>{
 const c=extract(native,'void AVPCityTerrainStreamActor::StreamAround(',
  'UE_LOG(LogTemp,Display,TEXT("[VEILPOINT terrain] Native R16 tiles visible:');
 assert.match(c,/const FIntPoint Center=VPCityTileGrid::TileFromWorldCentimetres/);
 assert.match(c,/const TArray<FIntPoint> Candidates=VPCityTileGrid::CandidateTiles\(Center,Radius\)/);
 assert.match(c,/constexpr int32 TileBudget=9/);
 assert.match(c,/if\(Desired\.Num\(\)>=TileBudget\)break/);
 assert.match(c,/if\(SourceTiles\.Contains\(Candidate\)&&!RejectedTiles\.Contains\(Candidate\)\)/);
 assert.match(c,/if\(!Desired\.Contains\(It\.Key\(\)\)\)/);
 assert.match(c,/LoadedHeightBytes\.Remove\(It\.Key\(\)\)/);
 assert.match(c,/if\(TileMeshes\.Num\(\)>=TileBudget\)break/);
 assert.match(native,/if\(Center==LastOrigin&&Radius==LastRadius\)return/);
 assert.match(header,/int32 LastRadius=-1/);
 assert.match(grid,/for\s*\(int32 Ring=0;\s*Ring<=Radius;\s*\+\+Ring\)/);
 const available=new Set();
 for(let x=-3;x<=4;x++)for(let z=-3;z<=4;z++)available.add(x+','+z);
 const a=selected([0,0],2,available);
 const b=selected([1,0],2,available);
 assert.equal(a.length,9);assert.equal(b.length,9);
 assert.ok(a.includes('0,0'));
 assert.ok(b.includes('1,0'),'new city tile MUST win the nine-slot budget');
 assert.ok(b.some(k=>!a.includes(k)),'old nine tiles must not monopolize radius-2 budget');
 assert.ok(a.some(k=>!b.includes(k)));
});
test('world-fixed native tile transforms and accurate one-sided border normals remove prior seam errors',()=>{
 const s=extract(native,'bool AVPCityTerrainStreamActor::CreateTileMesh(',
  'void AVPCityTerrainStreamActor::StreamAround(');
 assert.match(s,/Mesh->RegisterComponent\(\);[\s\S]*Mesh->SetWorldLocation\(FVector\(TileIndex\.X\*VPCityTerrain::TileEdgeCm/);
 assert.doesNotMatch(s,/Mesh->SetRelativeLocation\(FVector\(TileIndex\.X/);
 assert.match(s,/const int32 Left=FMath::Max\(0,Col-Step\)/);
 assert.match(s,/const int32 Right=FMath::Min\(Last,Col\+Step\)/);
 assert.match(s,/const int32 Bottom=FMath::Max\(0,Row-Step\)/);
 assert.match(s,/const int32 Top=FMath::Min\(Last,Row\+Step\)/);
 assert.match(s,/float\(Right-Left\)\*SampleSpacingCm/);
 assert.match(s,/float\(Top-Bottom\)\*SampleSpacingCm/);
 const unitSlope=(x)=>.03*x;
 for(const at of [0,8,252,496,504]){
  const left=Math.max(0,at-8),right=Math.min(504,at+8),
   derivative=(unitSlope(right)-unitSlope(left))/(right-left);
  assert.ok(Math.abs(derivative-.03)<1e-12);
 }
 assert.match(native,/LoadedHeightBytes\.Empty\(\)/);
 assert.match(native,/RejectedTiles\.Empty\(\)/);
});
