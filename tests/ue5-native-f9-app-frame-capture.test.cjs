'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const source=file=>fs.readFileSync(path.join(__dirname,'../Unreal/Veilpoint/Source/Veilpoint',file),'utf8');
test('UE5 PC benchmark is opted into by a real F9 key and never claims configured cap as measured FPS',()=>{
 const header=source('VPFrameTelemetry.h'),cpp=source('VPHUD.cpp'),hud=source('VPHUD.h');
 assert.match(cpp,/WasInputKeyJustPressed\(EKeys::F9\)/);
 assert.match(cpp,/FrameTelemetry\.BeginCapture\(\)/);
 assert.match(cpp,/FrameTelemetry\.EndCaptureAndSave\(/);
 assert.match(cpp,/FrameTelemetry\.GetCaptureElapsedSeconds\(\)>=120\.f/);
 assert.match(cpp,/FrameTelemetry\.Record\(FApp::GetDeltaTime\(\)\)/);
 assert.match(cpp,/NOT GPU/);
 assert.match(hud,/LastNativeBenchmarkStatus/);
 assert.match(header,/application-frame-time-not-gpu/);
 assert.match(header,/ve ilpoint/.replace('ve ilpoint','veilpoint'));
 assert.doesNotMatch(header,/gpuUsage|gpuLoad|monitorHz|rtx3070/i);
});

test('native benchmark uses bounded measured samples and derived frame percentiles before local save',()=>{
 const h=source('VPFrameTelemetry.h');
 assert.match(h,/CaptureSamplesMs\.Num\(\) < 40000/);
 assert.match(h,/CaptureSamplesMs\.Add\(FrameMs\)/);
 assert.match(h,/CaptureElapsedSeconds\+=float\(AppDeltaSeconds\)/);
 assert.match(h,/CaptureElapsedSeconds < 5\.f/);
 assert.match(h,/CaptureSamplesMs\.Num\(\) < 120/);
 assert.match(h,/TArray<float> Sorted = CaptureSamplesMs/);
 assert.match(h,/\.Sort\(\)/);
 assert.match(h,/Percentile\(\.50f\),Percentile\(\.95f\),Percentile\(\.99f\)/);
 assert.match(h,/SaveStringToFile\(Json,\*OutFile\)/);
 assert.match(h,/FPaths::ProjectSavedDir\(\)/);
 assert.match(h,/TEXT\("Benchmarks"\)/);
 assert.match(h,/FDateTime::UtcNow\(\)/);
 assert.match(h,/RejectedFrames/);
 assert.match(h,/bCaptureRunning = false/);
});

test('UE5 export JSON syntax is escaped as legal C++ string source and excludes identifiers',()=>{
 const h=source('VPFrameTelemetry.h');
 const section=h.slice(h.indexOf('const FString Json=FString::Printf('),h.indexOf('const FString Directory='));
 assert.ok(section.length>400);
 assert.match(section,/TEXT\("\{\\n/);
 assert.match(section,/\\\"schema\\\"/);
 assert.match(section,/\\\"full120Seconds\\\"/);
 assert.match(section,/\\\"p99FrameMs\\\"/);
 assert.doesNotMatch(section,/\\\\n/,'C++ source must use a single escape slash for newline');
 assert.doesNotMatch(section,/\\\\\"/,'C++ source must escape quote exactly once');
 assert.doesNotMatch(section,/playerToken|sessionId|accountId|physicalAddress|deviceSerial/);
});
