'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const cpp=fs.readFileSync(path.join(__dirname,'../Unreal/Veilpoint/Source/Veilpoint/VPWorldBootstrap.cpp'),'utf8');
const Sim=require('../src/simulation.js');
test('native UE5 harbor supplies map to actual physical BR east dock shelves',()=>{
 assert.equal(Sim.DOCK_DEPOTS.length,2);
 const matches=[...cpp.matchAll(/FVector\((\d+)\.f,(-?\d+)\.f,110\.f\)/g)]
  .map(m=>[Number(m[1]),Number(m[2])]);
 const dock=Sim.DOCK_DEPOTS.map(p=>[p.x*100,p.z*100]);
 for(const xy of dock)assert.ok(matches.some(m=>m[0]===xy[0]&&m[1]===xy[1]));
 assert.match(cpp,/if\(HasAuthority\(\)\)\s*\{/);
 assert.match(cpp,/i<UE_ARRAY_COUNT\(DockSupplySites\)/);
 assert.match(cpp,/for\(int32 i=0;i<18;\+\+i\)/,
  'retain a finite native supply count without instant recovery');
 assert.match(cpp,/SpawnActor<AVPPickup>/);
 assert.match(cpp,/P->Resource=TEXT\("charges"\)/);
 assert.doesNotMatch(cpp,/TEXT\("health"\)/);
});
