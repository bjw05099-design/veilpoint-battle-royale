'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const Story=require('../src/story-slice.js');
const root=path.resolve(__dirname,'../Unreal/Veilpoint/Source/Veilpoint');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const state=read('VPStoryGameState.cpp'),stateH=read('VPStoryGameState.h'),
 mode=read('VPStoryGameMode.cpp'),hud=read('VPHUD.cpp');
test('native CH01 opening matches browser causal timeline and never rewrites why Lee traveled',()=>{
 const source=state.slice(state.indexOf('int32 AVPStoryGameState::GetOpeningBeat()'),
   state.indexOf('FString AVPStoryGameState::GetObjectiveLabel()'));
 assert.match(source,/StoryStage != EVPStoryStage::RestoreRelay/);
 assert.match(source,/GetWorld\(\)->GetTimeSeconds\(\)/);
 for(const n of ['3.4','6.8','10.2'])assert.match(source,new RegExp('Elapsed < '+n.replace('.','\\.')));
 for(const phrase of ['BEFORE DEPARTURE / KOREA',
   'ARRIVAL / FICTIONAL COASTAL CITY','AFTER ARRIVAL / UNEXPECTED ESCALATION',
   'LEE SU-HYEOK','KIM JI-YUN','JO HYEON-JI'])
   assert.ok(source.includes(phrase),'chronological/native character beat missing '+phrase);
 assert.match(source,/Civilian communications mission and return plan briefed/);
 assert.match(source,/this was not a civil-war deployment/);
 assert.match(source,/Conflict spread after arrival/);
 const fresh=Story.createState();
 for(const [time,location] of [[0,'출국 전'],[3.5,'도착'],[7.0,'도착 후']]){
  fresh.world.elapsed=time;
  assert.ok(Story.openingBeat(fresh)?.location.includes(location),'browser and native source order');
 }
 fresh.world.elapsed=10.2;assert.equal(Story.openingBeat(fresh),null);
});
test('native opening is fresh-only with no lost-save rebriefing or imposed paper gate',()=>{
 const restoration=state.slice(state.indexOf('bool AVPStoryGameState::RestoreProgress('),
  state.indexOf('bool AVPStoryGameState::IsAvailable('));
 assert.match(stateH,/bool bFreshLocalOpening = true/);
 assert.match(restoration,/if \(!bCoherent \|\| \(bBeacon && Stage == EVPStoryStage::RestoreRelay\)\) return false/);
 assert.match(restoration,/bFreshLocalOpening = false/);
 assert.ok(restoration.indexOf('bFreshLocalOpening = false')>
   restoration.indexOf('if (!bCoherent ||'),'reject impossible old saves before mutating opening');
 assert.ok(restoration.indexOf('bFreshLocalOpening = false')<
   restoration.indexOf('StoryStage = Stage'),'valid restoration disables rebriefing before stage assignment');
 assert.doesNotMatch(read('VPStoryCheckpoint.h'),/OpeningBeat|bFreshLocalOpening/,
   'v1/v2 checkpoint byte schema must remain unchanged');
 assert.match(mode,/RestoreStoryCheckpoint\(\)/);
 const available=state.slice(state.indexOf('bool AVPStoryGameState::IsAvailable('),
  state.indexOf('bool AVPStoryGameState::TryAdvance('));
 assert.match(available,/case EVPStoryStage::RestoreRelay:[\s\S]*?Action == EVPStoryAction::RestoreRelay/);
 assert.match(available,/Action == EVPStoryAction::ChooseSouth/);
 assert.match(available,/Action == EVPStoryAction::ChooseEast/);
});
test('native player sees short actual bottom-screen timed scene only in CH01 without disabling movement',()=>{
 const start=hud.indexOf('if (const AVPStoryGameState* Story =');
 const end=hud.indexOf('const FString SupplyLabel',start);
 const section=hud.slice(start,end);
 assert.ok(start>0&&end>start);
 assert.match(section,/const FString OpeningLocation = Story->GetOpeningLocation\(\)/);
 assert.match(section,/if \(!OpeningLocation.IsEmpty\(\)\)/);
 assert.match(section,/Story->GetOpeningDialogue\(\)/);
 assert.match(section,/IntroTop=Canvas->ClipY-90.f\*Scale/);
 assert.match(section,/DrawRect\(FLinearColor/);
 assert.match(section,/return;\s*}/);
 assert.doesNotMatch(section,/SetInputMode|DisableInput|SetPause|PlaySoundAtLocation|ClientTravel/,
  'intro is explanatory and brief, not a forced-stop cutscene');
});
