'use strict';
// Unreal HUD source-contract test: game data is server-owned and replicated.
// This does NOT assert real UE5 or Win64 rendering/compilation success.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const dir=path.resolve(__dirname,'..','Unreal','Veilpoint','Source','Veilpoint');
const read=name=>fs.readFileSync(path.join(dir,name),'utf8');
const header=read('VPHUD.h');
const hud=read('VPHUD.cpp');
const character=read('VPCharacter.cpp');
const zoneHeader=read('VPZone.h');
const zone=read('VPZone.cpp');
const gameMode=read('VPGameMode.cpp');

test('UE5 Win64 HUD displays existing finite resources from the replicated pawn',()=>{
 assert.match(character,/DOREPLIFETIME\(AVPCharacter, Charges\)/);
 assert.match(hud,/Pawn->Charges/);
 assert.match(hud,/SUPPLIES  %d \/ 60/);
 assert.match(hud,/FMath::Clamp\(Pawn->Charges,0,60\)/);
 assert.match(hud,/Pawn->GetStaminaRatio\(\)/);
 assert.match(hud,/Pawn->Health/);
 assert.match(gameMode,/HUDClass=AVPHUD::StaticClass\(\)/);
 assert.doesNotMatch(hud,/localStorage|WebBrowser|ClientEstimatedAmmo/);
});

test('UE5 replicated zone is a client-readable local actor, not a magic HUD prediction',()=>{
 for(const name of ['Radius','Phase','ZoneCenter','Remaining']){
  assert.match(zoneHeader,new RegExp('UPROPERTY\\(Replicated, BlueprintReadOnly, Category="Safe Zone"\\)[\\s\\S]*?\\b'+name+'\\b'));
  assert.match(zone,new RegExp('DOREPLIFETIME\\(AVPZone,\\s*'+name+'\\)'));
 }
 assert.match(hud,/#include "VPZone.h"/);
 assert.match(hud,/AVPZone\* Zone = CachedZone\.Get\(\)/);
 assert.match(hud,/if \(!Zone\) return/);
 assert.match(hud,/Zone->Radius/);
 assert.match(hud,/Zone->Remaining/);
 assert.match(hud,/Zone->Phase/);
 assert.match(hud,/Zone->ZoneCenter/);
 assert.doesNotMatch(hud,/Server,|Reliable|GetAllActorsOfClass/);
});

test('UE5 HUD caches the safe-zone actor instead of walking every actor at each 165Hz render',()=>{
 assert.match(header,/TWeakObjectPtr<AVPZone> CachedZone/);
 assert.match(hud,/if \(!Zone && GetWorld\(\)\)\s*\{[\s\S]*?TActorIterator<AVPZone> It\(GetWorld\(\)\)/);
 assert.match(hud,/CachedZone=Zone/);
 assert.match(hud,/if \(!Zone\) return/);
 const found=[...hud.matchAll(/TActorIterator<AVPZone>/g)];
 assert.equal(found.length,1,'zone discovery must not be repeated in multiple HUD paths');
});

test('UE5 HUD keeps zone distance comparison in centimetres and visible radius in metres',()=>{
 assert.match(hud,/const float RadiusCm = FMath::Max\(0\.f, Zone->Radius\)/);
 assert.match(hud,/RadiusCm \/ 100\.f/);
 assert.match(hud,/const float Remaining = FMath::Max\(0\.f, Zone->Remaining\)/);
 assert.match(hud,/FMath::CeilToInt\(Remaining\)/);
 assert.match(hud,/const FVector2D PlayerPosition\(Location\.X,Location\.Y\)/);
 assert.match(hud,/FVector2D::Distance\(PlayerPosition,Zone->ZoneCenter\)>RadiusCm/);
 assert.match(hud,/OUTSIDE THE SAFE AREA/);
 assert.match(hud,/FMath::Clamp\(Zone->Phase \+ 1,1,6\)/);
});

test('UE5 completed native round shows outcome and does not display stale live zone prompts',()=>{
 const ended=hud.indexOf('if (!Pawn->IsAlive())');
 const zoneLookup=hud.indexOf('AVPZone* Zone = CachedZone.Get()');
 assert.ok(ended>0 && zoneLookup>ended,'finished pawn must exit HUD before zone discovery');
 const endBlock=hud.slice(ended,zoneLookup);
 assert.match(endBlock,/ROUND ENDED - MOVEMENT DISABLED/);
 assert.match(endBlock,/\breturn;/);
 assert.match(zoneHeader,/bAlwaysRelevant|UPROPERTY\(Replicated/);
});
