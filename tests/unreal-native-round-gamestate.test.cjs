'use strict';
// Static native Unreal contracts; Windows 5.8 UBT/net PIE still needed.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const base=path.resolve(__dirname,'..','Unreal','Veilpoint','Source','Veilpoint');
const read=(file)=>fs.readFileSync(path.join(base,file),'utf8');
const header=read('VPGameState.h');
const source=read('VPGameState.cpp');
const mode=read('VPGameMode.cpp');
const hud=read('VPHUD.cpp');
const zone=read('VPZone.cpp');

test('native GameMode registers a separately replicated UE5 GameState for clients',()=>{
 assert.match(header,/class VEILPOINT_API AVPGameState : public AGameStateBase/);
 assert.match(source,/AVPGameState::AVPGameState\(\)[\s\S]*?bReplicates = true;/);
 assert.match(source,/bAlwaysRelevant = true;/);
 assert.match(mode,/#include "VPGameState.h"/);
 assert.match(mode,/GameStateClass=AVPGameState::StaticClass\(\)/);
 assert.match(mode,/DefaultPawnClass=AVPCharacter::StaticClass\(\)/);
});

test('native active-player count and completion flag are replicated only from authority',()=>{
 for(const name of ['ActiveSurvivors','bRoundComplete']){
   assert.match(header,new RegExp('UPROPERTY\\(Replicated, BlueprintReadOnly, Category="VEILPOINT\\|Round"\\)[\\s\\S]*?\\b'+name+'\\b'));
   assert.match(source,new RegExp('DOREPLIFETIME\\(AVPGameState, '+name+'\\)'));
 }
 assert.match(source,/void AVPGameState::UpdateRoundState\(int32 AliveCount, bool bFinished\)/);
 assert.match(source,/if \(!HasAuthority\(\)\) return/);
 assert.match(source,/FMath::Max\(0, AliveCount\)/);
 assert.match(source,/if \(ActiveSurvivors == SafeAliveCount && bRoundComplete == bFinished\) return/);
 assert.match(source,/ForceNetUpdate\(\)/);
 assert.doesNotMatch(header,/UFUNCTION\(Server|UFUNCTION\(Client/);
});

test('native round state follows existing physical survivors in server GameMode',()=>{
 assert.match(mode,/if\(!HasAuthority\(\)\|\|bRoundComplete\)return/);
 assert.match(mode,/for\(TActorIterator<AVPCharacter> It\(GetWorld\(\)\);It;\+\+It\)/);
 assert.match(mode,/if\(It->IsAlive\(\)\)Living\+\+/);
 assert.match(mode,/if\(bSeenMultiplePlayers&&Living<=1\)\{bRoundComplete=true;/);
 assert.match(mode,/NativeState->UpdateRoundState\(Living,bRoundComplete\)/);
 assert.match(mode,/GetWorld\(\)->GetGameState<AVPGameState>\(\)/);
});

test('native HUD gets alive count and round result from GameState, never game mode',()=>{
 assert.match(hud,/#include "VPGameState.h"/);
 assert.match(hud,/GetGameState<AVPGameState>\(\)/);
 assert.match(hud,/RoundState->ActiveSurvivors/);
 assert.match(hud,/ACTIVE PLAYERS  %d/);
 assert.match(hud,/RoundState->bRoundComplete/);
 assert.match(hud,/ROUND COMPLETE/);
 assert.doesNotMatch(hud,/GetAuthGameMode|AVPGameMode\*|GetAllActorsOfClass/);
});

test('terminal round HUD never exposes stale live zone or client-generated completion',()=>{
 const dead=hud.indexOf('if (!Pawn->IsAlive())');
 const ended=hud.indexOf('if (RoundState && RoundState->bRoundComplete)');
 const lookup=hud.indexOf('AVPZone* Zone = CachedZone.Get()');
 assert.ok(dead>=0&&ended>dead&&lookup>ended);
 assert.match(hud.slice(ended,lookup),/ROUND COMPLETE[\s\S]*?return;/);
 assert.match(zone,/DOREPLIFETIME\(AVPZone,Remaining\)/);
 assert.doesNotMatch(hud,/ClientSaysWin|SendVictory|SetRoundComplete\(/);
});
