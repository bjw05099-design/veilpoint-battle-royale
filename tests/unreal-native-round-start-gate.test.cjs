'use strict';
// Native UE5 source contracts only. Windows UBT/editor/PIE still unverified.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../Unreal/Veilpoint/Source/Veilpoint');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const stateH=read('VPGameState.h'),state=read('VPGameState.cpp'),
  mode=read('VPGameMode.cpp'),zone=read('VPZone.cpp'),
  zoneH=read('VPZone.h'),hud=read('VPHUD.cpp');

test('native BR round-start latch is authoritative, replicated and monotonic',()=>{
 assert.match(stateH,/UPROPERTY\(Replicated, BlueprintReadOnly, Category="VEILPOINT\|Round"\)\s*bool bRoundStarted = false;/);
 assert.match(stateH,/void MarkRoundStarted\(\);/);
 assert.match(state,/DOREPLIFETIME\(AVPGameState, bRoundStarted\)/);
 assert.match(state,/void AVPGameState::MarkRoundStarted\(\)[\s\S]*?if \(!HasAuthority\(\) \|\| bRoundStarted\) return;[\s\S]*?bRoundStarted = true;[\s\S]*?ForceNetUpdate\(\)/);
 assert.doesNotMatch(state,/bRoundStarted\s*=\s*false/);
 assert.doesNotMatch(stateH,/UFUNCTION\(Server/);
});

test('native lobby becomes active only after physical server player-count threshold',()=>{
 assert.match(mode,/if\(Total>=2\)bSeenMultiplePlayers=true/);
 assert.match(mode,/GetGameState<AVPGameState>\(\)/);
 assert.match(mode,/NativeState->UpdateRoundState\(Living,bRoundComplete\)/);
 assert.match(mode,/if\(bSeenMultiplePlayers\) NativeState->MarkRoundStarted\(\)/);
 assert.doesNotMatch(mode,/ClientStartRound|ClientDecideStart|Server, Reliable/);
});

test('native zone does not shrink during waiting lobby and starts its clock from observed server start',()=>{
 const update=zone.slice(zone.indexOf('void AVPZone::UpdateZone()'),zone.indexOf('void AVPZone::GetLifetimeReplicatedProps('));
 const completed=update.indexOf('if (Match->bRoundComplete)');
 const waiting=update.indexOf('if (!Match->bRoundStarted) return;');
 const start=update.indexOf('if (!bZoneClockStarted)');
 const clock=update.indexOf('float time=FMath::Max(');
 const damage=update.indexOf('UGameplayStatics::ApplyDamage(');
 assert.ok(completed>=0&&waiting>completed&&start>waiting&&clock>start&&damage>clock);
 assert.match(zoneH,/bool bZoneClockStarted = false/);
 assert.match(update,/if \(!bZoneClockStarted\)[\s\S]*?StartServerTimeSeconds=GetWorld\(\)->GetTimeSeconds\(\);[\s\S]*?bZoneClockStarted=true/);
 assert.match(update,/else return; \/\/ GameState not replicated\/ready/);
 assert.match(update,/ClearTimer\(ZoneTimer\)/);
 assert.match(zone,/GetWorldTimerManager\(\)\.SetTimer\(ZoneTimer,this,&AVPZone::UpdateZone,\.25f,true\)/);
});

test('native Windows HUD keeps paused lobby distinct from active zone countdown and round result',()=>{
 const finished=hud.indexOf('if (RoundState && RoundState->bRoundComplete)');
 const missing=hud.indexOf('if (!RoundState)');
 const lobby=hud.indexOf('if (!RoundState->bRoundStarted)');
 const zoneFetch=hud.indexOf('AVPZone* Zone = CachedZone.Get()');
 assert.ok(finished>=0&&missing>finished&&lobby>missing&&zoneFetch>lobby,
  'native HUD first checks server round completion, then missing/paused GameState before publishing a zone countdown');
 assert.match(hud.slice(missing,lobby),/TIMER HIDDEN[\s\S]*?return;/);
 assert.match(hud.slice(lobby,zoneFetch),/OFFLINE SOLO WORLD PREVIEW - BR ROUND NOT STARTED[\s\S]*?WAITING FOR PLAYERS - ROUND NOT STARTED[\s\S]*?return;/);
 assert.match(hud,/RoundState->ActiveSurvivors/);
 assert.match(hud,/FMath::CeilToInt\(Remaining\)/);
 assert.doesNotMatch(hud,/ClientPredictedLobby|ClientStartsMatch|WebBrowser/);
});
