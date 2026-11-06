'use strict';
// Contract tests only: UE5 native editor/cook/executable is not installed in Node CI.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=name=>fs.readFileSync(path.resolve(__dirname,'../Unreal/Veilpoint/Source/Veilpoint',name),'utf8');
const hud=read('VPHUD.cpp'),zone=read('VPZone.cpp'),mode=read('VPGameMode.cpp');

test('UE5 native solo Windows preview cannot claim an active BR lobby or countdown',()=>{
  assert.match(hud,/if \(!RoundState\)\s*\{[\s\S]*?TIMER HIDDEN[\s\S]*?return;/);
  assert.match(hud,/if \(!RoundState->bRoundStarted\)/);
  assert.match(hud,/GetNetMode\(\)==NM_Standalone/);
  assert.match(hud,/OFFLINE SOLO WORLD PREVIEW - BR ROUND NOT STARTED/);
  assert.match(hud,/WAITING FOR PLAYERS - ROUND NOT STARTED/);
  const missing=hud.indexOf('if (!RoundState)');
  const waiting=hud.indexOf('if (!RoundState->bRoundStarted)');
  const zoneDisplay=hud.indexOf('AVPZone* Zone = CachedZone.Get()');
  assert.ok(missing>0&&missing<waiting&&waiting<zoneDisplay,
    'HUD must fail closed before it consults the replicated zone countdown');
});

test('UE5 native solo preview does not alter authoritative match or freeze-zone gates',()=>{
  assert.match(mode,/if\(Total>=2\)bSeenMultiplePlayers=true;/);
  assert.match(mode,/if\(bSeenMultiplePlayers\) NativeState->MarkRoundStarted\(\);/);
  assert.match(zone,/if \(!Match->bRoundStarted\) return;/);
  assert.match(zone,/if \(Match->bRoundComplete\)/);
  assert.doesNotMatch(mode,/MarkRoundStarted\(\)\s*;[\s\S]*?NM_Standalone/);
  assert.doesNotMatch(hud,/MarkRoundStarted\(|UpdateRoundState\(/,
    'native HUD must never declare victory or begin a round');
});
