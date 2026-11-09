'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const Tiles=require('../src/aden-citywide-tiles.js');
const native=fs.readFileSync(path.resolve(__dirname,
 '../Unreal/Veilpoint/Source/Veilpoint/VPCityTileGrid.h'),'utf8');
test('UE5 and JS agree on 1:1 metres, 512m tiles and 51200cm tile extent',()=>{
 assert.equal(Tiles.METRES_PER_UNIT,1);
 assert.equal(Tiles.TILE_METRES,512);
 assert.equal(Tiles.UE_CENTIMETRES,51200);
 for(const str of [
  /namespace VPCityTileGrid/,
  /EdgeMetres = 512;/,
  /EdgeCentimetres = 51200\.f;/,
  /MetresPerWorldUnit = 1\.f;/,
  /UnrealCentimetresPerMetre = 100\.f;/,
  /FMath::FloorToInt\(WorldLocation\.X \/ EdgeCentimetres\)/,
  /FMath::FloorToInt\(WorldLocation\.Y \/ EdgeCentimetres\)/,
  /float\(Tile\.X\) \* EdgeCentimetres/,
  /float\(Tile\.Y\) \* EdgeCentimetres/
 ])assert.match(native,str);
 for(const [x,z] of [[0,0],[511.999,-.01],[512,512],[-512,-512],
   [-512.0001,0],[-.5,511.5],[12530,-9300]]){
  const js=Tiles.tileFor(x,z),
   nativeEquivalent={tx:Math.floor((x*100)/Tiles.UE_CENTIMETRES),
    tz:Math.floor((z*100)/Tiles.UE_CENTIMETRES)};
  assert.deepEqual([js.tx,js.tz],[nativeEquivalent.tx,nativeEquivalent.tz]);
  assert.deepEqual([Tiles.tileBounds(js.tx,js.tz).minX,
    Tiles.tileBounds(js.tx,js.tz).minZ],
   [nativeEquivalent.tx*512,nativeEquivalent.tz*512]);
 }
});
test('UE5 tile rings are bounded and ordered before actual World Partition integration',()=>{
 assert.match(native,/inline TArray<FIntPoint> CandidateTiles/);
 assert.match(native,/if \(Radius < 0 \|\| Radius > 6\) return Result;/);
 assert.match(native,/for \(int32 Ring=0;Ring<=Radius;\+\+Ring\)/);
 assert.match(native,/FMath::Max\(FMath::Abs\(Dx\),FMath::Abs\(Dy\)\)!=Ring/);
 assert.match(native,/Result\.Add\(FIntPoint\(Origin\.X\+Dx,Origin\.Y\+Dy\)\)/);
 const rings=[];
 for(let radius=0;radius<=6;radius++){
  const coords=[];
  for(let ring=0;ring<=radius;ring++)
   for(let dx=-ring;dx<=ring;dx++)
    for(let dz=-ring;dz<=ring;dz++)
     if(Math.max(Math.abs(dx),Math.abs(dz))===ring)
      coords.push([dx,dz]);
  assert.equal(coords.length,(2*radius+1)**2);
  assert.equal(new Set(coords.map(c=>c.join(':'))).size,coords.length);
  rings.push(coords.length);
 }
 assert.deepEqual(rings,[1,9,25,49,81,121,169]);
});
test('native header is explicitly math-only, not a misleading completed UE5 world stream',()=>{
 assert.doesNotMatch(native,/WorldPartitionSubsystem|StreamingLevel|LoadLevelInstance|SetShouldBeLoaded/);
 assert.match(native,/This is a mathematical seam\/placement/);
 assert.match(native,/does NOT create a World Partition level/);
 const map=fs.readFileSync(path.resolve(__dirname,
  '../docs/ADEN_FULL_CITY_1TO1_PRODUCTION_PLAN.md'),'utf8');
 assert.match(map,/512m square tiles/);
 assert.match(map,/no.*DEM tile has yet been downloaded/i);
 assert.match(map,/not a provable claim/);
});
