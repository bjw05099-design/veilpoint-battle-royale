'use strict';
// Source-only preflight; no native UE5 binary, GPU, or monitor is simulated.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../Unreal/Veilpoint/Source/Veilpoint');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const telemetry=read('VPFrameTelemetry.h'),hudH=read('VPHUD.h'),hud=read('VPHUD.cpp');

test('UE5 native HUD measures actual application callbacks rather than selected FPS cap',()=>{
 assert.match(hudH,/#include "VPFrameTelemetry.h"/);
 assert.match(hudH,/FVPFrameTelemetry FrameTelemetry/);
 assert.match(hud,/#include "Misc\/App.h"/);
 assert.match(hud,/FrameTelemetry\.Record\(FApp::GetDeltaTime\(\)\)/);
 assert.match(hud,/FrameTelemetry\.GetObservedFPS\(\)/);
 assert.match(hud,/FrameTelemetry\.GetP95FrameMs\(\)/);
 assert.match(hud,/UVPGameUserSettings::GetVeilpointSettings\(\)/);
 assert.match(hud,/NativeSettings->GetFrameRateLimit\(\)/);
 assert.doesNotMatch(hud,/FrameTelemetry\.Record\(1\.f\s*\/\s*165\.f\)/);
});

test('UE5 native timing rejects invalid clocks, focus loss and old evidence',()=>{
 assert.match(telemetry,/FMath::IsFinite\(AppDeltaSeconds\)/);
 assert.match(telemetry,/AppDeltaSeconds <= 0\.0 \|\| AppDeltaSeconds > \.25/);
 assert.match(telemetry,/Reset\(\);\s*return;/);
 assert.match(telemetry,/bHasEvidence = false/);
 assert.match(telemetry,/RefreshSeconds < \.5f \|\| SamplesMs\.Num\(\) < 24/);
 assert.match(telemetry,/ObservedFPS = 1000\.f \* Sorted\.Num\(\) \/ TotalMs/);
});

test('UE5 FPS/p95 samples remain bounded and sorted only at display refresh intervals',()=>{
 assert.match(telemetry,/constexpr int32 Capacity = 240/);
 assert.match(telemetry,/if \(SamplesMs\.Num\(\) < Capacity\)/);
 assert.match(telemetry,/SamplesMs\[Cursor\] = FrameMs/);
 assert.match(telemetry,/Cursor = \(Cursor \+ 1\) % Capacity/);
 assert.match(telemetry,/TArray<float> Sorted = SamplesMs;\s*Sorted\.Sort\(\)/);
 assert.match(telemetry,/FMath::CeilToInt\(\.95f \* Sorted\.Num\(\)\) - 1/);
 assert.match(telemetry,/P95FrameMs = Sorted\[P95Index\]/);
});

test('UE5 PC display distinguishes native viewport pixels from GPU time and monitor Hz',()=>{
 assert.match(hud,/APP FRAMES %.0f FPS \| P95 %.1fms/);
 assert.match(hud,/GAME VIEWPORT %.0fx%.0f \| CAP %.0f \| NOT GPU TIMING/);
 assert.match(hud,/Canvas->ClipX,Canvas->ClipY,ConfiguredCap/);
 assert.match(hud,/APP FRAMES: CALIBRATING/);
 assert.doesNotMatch(hud,/RTX 3070 VERIFIED|MONITOR HZ VERIFIED|GPU FRAMETIME PASS/);
});
