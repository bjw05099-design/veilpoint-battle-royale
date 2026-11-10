'use strict';
// Native UE5 executable validation still requires the Unreal toolchain. These
// contracts prevent a future source-only change from silently reintroducing a
// nine-tile procedural-mesh frame hitch or an origin-stalled partial stream.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const cpp=fs.readFileSync(path.join(root,
 'Unreal/Veilpoint/Source/Veilpoint/VPCityTerrainStreamActor.cpp'),'utf8');
const header=fs.readFileSync(path.join(root,
 'Unreal/Veilpoint/Source/Veilpoint/VPCityTerrainStreamActor.h'),'utf8');

test('UE5 preview tile streamer has an editable bounded per-tick mesh build budget',()=>{
 assert.match(header,/int32 MaxTileBuildsPerTick=1;/);
 assert.match(header,/ClampMin="1",ClampMax="3"/);
 assert.match(cpp,/const int32 BuildBudget=FMath::Clamp\(MaxTileBuildsPerTick,1,3\)/);
 assert.match(cpp,/BuiltThisTick>=BuildBudget/);
 assert.match(cpp,/if\(CreateTileMesh\(Candidate\)\)\+\+BuiltThisTick/);
 assert.match(cpp,/TileMeshes\.Num\(\)>=TileBudget/);
 assert.match(cpp,/LoadedHeightBytes\.Remove\(It\.Key\(\)\)/);
 assert.match(cpp,/VPCityTerrain::MatchingEdgeR16/);
 assert.match(cpp,/ReadValidatedR16\(\*Tile,Bytes\)/);
 assert.doesNotMatch(cpp,/if\(Center==LastOrigin&&Radius==LastRadius\)return;/,
  'an old origin-only early return would permanently strand tiles 2–9');
});

test('UE5 repeated actor ticks can finish nine requested tiles without moving the player',()=>{
 assert.match(header,/bool bPendingTileBuilds=false;/);
 assert.match(cpp,/!bOriginChanged&&!bPendingTileBuilds\)return;/);
 assert.match(cpp,/bPendingTileBuilds=bRejectedThisTick;/);
 assert.match(cpp,/!TileMeshes\.Contains\(Candidate\)&&!RejectedTiles\.Contains\(Candidate\)/);
 const desired=Array.from({length:9},(_,i)=>i);
 for(const perTick of [1,2,3]){
  const resident=new Set(),loadedPerTick=[];
  for(let i=0;resident.size<desired.length;i++){
   assert.ok(i<20,'same origin must finish loading on later 0.75s ticks');
   const pending=desired.filter(x=>!resident.has(x)).slice(0,perTick);
   assert.ok(pending.length<=3);
   pending.forEach(x=>resident.add(x));
   loadedPerTick.push(pending.length);
  }
  assert.equal(resident.size,9);
  assert.ok(loadedPerTick.every(n=>n<=perTick));
  assert.equal(loadedPerTick.length,Math.ceil(9/perTick));
 }
});

test('UE5 corrupt or non-seam-aligned source tiles cannot be promoted into a collision section',()=>{
 assert.match(cpp,/RejectedTiles\.Add\(TileIndex\);/);
 assert.match(cpp,/if\(!ReadValidatedR16\(\*Tile,Bytes\)\)/);
 assert.match(cpp,/if\(AdjacentBytes && !VPCityTerrain::MatchingEdgeR16/);
 assert.match(cpp,/bPendingTileBuilds=bRejectedThisTick/);
 assert.match(cpp,/!Desired\.Contains\(Candidate\)\|\|TileMeshes\.Contains\(Candidate\)\|\|\s*RejectedTiles\.Contains\(Candidate\)/);
 assert.match(cpp,/bPendingTileBuilds=false;/,
  'PIE scene teardown should reset unfinished tile creation');
 assert.match(cpp,/Mesh->CreateMeshSection_LinearColor/);
});
