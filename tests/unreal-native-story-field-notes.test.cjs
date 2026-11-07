'use strict';
// UE5 runner preflight: this is NOT a native UnrealBuildTool compile claim.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../Unreal/Veilpoint/Source/Veilpoint');
const cpp=fs.readFileSync(path.join(root,'VPHUD.cpp'),'utf8');
const header=fs.readFileSync(path.join(root,'VPHUD.h'),'utf8');
const state=fs.readFileSync(path.join(root,'VPStoryGameState.h'),'utf8');

test('native story field notebook is player-operated from J, remains story-only and requires no RPC',()=>{
 assert.match(cpp,/#include "InputCoreTypes\.h"/);
 const block=cpp.slice(cpp.indexOf('if (const AVPStoryGameState* Story ='),
   cpp.indexOf('// Finite supplies stay visible'));
 assert.ok(block.includes('PlayerOwner->WasInputKeyJustPressed(EKeys::J)'));
 assert.ok(block.includes('bStoryJournalOpen = !bStoryJournalOpen'));
 assert.ok(block.includes('if (bStoryJournalOpen)'));
 assert.match(header,/bool bStoryJournalOpen = false;/);
 assert.doesNotMatch(header,/UPROPERTY\(Replicated[^)]*\)\s*bool bStoryJournalOpen/);
 assert.doesNotMatch(block,/Server|ClientRPC|GameplayStatics::SaveGame/);
 assert.doesNotMatch(cpp.slice(cpp.indexOf('// Finite supplies stay visible')),
  /WasInputKeyJustPressed\(EKeys::J\)/);
});
test('native field notes require physically earned source flags and conceal uninspected evidence',()=>{
 assert.match(state,/bool bReadHarbor = false/);
 assert.match(state,/bool bReadShelter = false/);
 assert.match(state,/bool bBeaconActivated = false/);
 for(const [flag,known,unknown] of [
  ['bReadHarbor','HARBOR RECORD 04:12 | OBSERVED','HARBOR RECORD | NOT YET INSPECTED'],
  ['bReadShelter','SHELTER RECORD 04:07 | OBSERVED','SHELTER RECORD | NOT YET INSPECTED'],
  ['bBeaconActivated','HARBOR SIGNAL | SWITCH ON','HARBOR SIGNAL | NOT ACTIVE']
 ]){
  const i=cpp.indexOf('Story->'+flag+'\n');
  assert.ok(i>=0,'missing authoritative observed fact '+flag);
  const slice=cpp.slice(i,i+210);
  assert.ok(slice.includes(known)&&slice.includes(unknown),
    'notebook must render both hidden and observed states for '+flag);
 }
 assert.match(cpp,/Story->bReadHarbor && Story->bReadShelter/);
 assert.match(cpp,/TIMESTAMPS DIFFER \| CAUSE UNKNOWN/);
});
test('native notebook uses a bounded panel inside viewport without a browser dependency',()=>{
 const native=cpp.slice(cpp.indexOf('if (bStoryJournalOpen)'),
   cpp.indexOf('// Nearby optional mission wayfinding'));
 assert.match(native,/FMath::Min\(410\.f\*Scale,Canvas->ClipX\*\.47f\)/);
 assert.match(native,/Canvas->ClipX-Width-18\.f\*Scale/);
 assert.match(native,/Canvas->ClipY-214\.f\*Scale/);
 assert.match(native,/DrawRect\(/);
 assert.doesNotMatch(native,/WebBrowser|XMLHttpRequest|fetch\(|WebSocket|GetAllActorsOfClass/);
});
