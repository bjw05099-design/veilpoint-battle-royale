'use strict';
// Native UE5 source contracts only. Windows UBT/editor/PIE still unverified.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {spawnSync}=require('node:child_process');
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

test('BR accepts a desired ready state and keeps a duplicate command harmless',()=>{
 const controller=read('VPPlayerController.cpp');
 const request=read('VPPlayerController.h');
 const lobby=mode.slice(mode.indexOf('void AVPGameMode::SetReadyFromController'),
  mode.indexOf('void AVPGameMode::CancelReadyCountdown'));
 assert.match(request,/UFUNCTION\(Server, Reliable\)\s*void ServerSetRoundReady\(bool bReady\)/);
 assert.match(controller,/IsRoundReadyPending\(\)\) return;[\s\S]*?bRequestedRoundReady = !bRoundReady;[\s\S]*?ServerSetRoundReady\(bRequestedRoundReady\)/);
 assert.match(controller,/bRequestedRoundReady != bRoundReady && FPlatformTime::Seconds\(\) < RoundReadyRequestExpiresAt/);
 assert.match(lobby,/Controller->bRoundReady == bReady\) return;[\s\S]*?Controller->bRoundReady = bReady;/);
 assert.match(lobby,/if \(!Controller->bRoundReady\) CancelReadyCountdown\(\)/);
 assert.match(controller,/if \(bFirstClient\) ServerSetRoundReady\(true\);/);
});

test('native ready lobby restarts its countdown after readiness changes or a player departs',
 {skip: process.platform === 'win32'}, () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'vp-ready-lobby-'));
  try {
   const exe = path.join(temp, 'verify');
   const cpp = `
    #include "VPBRLobbyRules.h"
    #include <cassert>
    int main() {
      using VPBRLobby::AdvanceCountdown;
      using VPBRLobby::Stage;
      using VPBRLobby::EStage;
      assert(Stage(1, 1, 9.) == EStage::WaitingForPlayers);
      assert(Stage(2, 1, 9.) == EStage::WaitingForReady);
      assert(Stage(2, 2, 0.) == EStage::AllReady);
      assert(Stage(2, 2, 9.) == EStage::Countdown);
      double endsAt = 0.;
      assert(!AdvanceCountdown(0., 1, 1, endsAt) && endsAt == 0.);
      assert(!AdvanceCountdown(5., 2, 2, endsAt) && endsAt == 9.);
      assert(!AdvanceCountdown(8.9, 2, 2, endsAt) && endsAt == 9.);
      assert(!AdvanceCountdown(9., 2, 1, endsAt) && endsAt == 0.);
      assert(!AdvanceCountdown(10., 2, 2, endsAt) && endsAt == 14.);
      assert(!AdvanceCountdown(12., 3, 2, endsAt) && endsAt == 0.);
      assert(!AdvanceCountdown(13., 3, 3, endsAt) && endsAt == 17.);
      assert(!AdvanceCountdown(14., 1, 1, endsAt) && endsAt == 0.);
      assert(!AdvanceCountdown(15., 2, 2, endsAt) && endsAt == 19.);
      assert(!AdvanceCountdown(18.999, 2, 2, endsAt));
      assert(AdvanceCountdown(19., 2, 2, endsAt));
    }
   `;
   const compilation = spawnSync('c++', ['-std=c++17', '-I', root, '-x', 'c++', '-', '-o', exe],
    {input: cpp, encoding: 'utf8', timeout: 15000});
   assert.equal(compilation.status, 0, compilation.stderr);
   const native = spawnSync(exe, [], {encoding: 'utf8', timeout: 4000});
   assert.equal(native.status, 0, native.stderr);
  } finally {
   fs.rmSync(temp, {recursive: true, force: true});
  }
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
