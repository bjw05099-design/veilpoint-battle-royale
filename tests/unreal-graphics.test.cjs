'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=(p)=>fs.readFileSync(path.join(root,p),'utf8');
const header=read('Unreal/Veilpoint/Source/Veilpoint/VPGameUserSettings.h');
const source=read('Unreal/Veilpoint/Source/Veilpoint/VPGameUserSettings.cpp');
const engine=read('Unreal/Veilpoint/Config/DefaultEngine.ini');
const defaults=read('Unreal/Veilpoint/Config/DefaultGameUserSettings.ini');
const presets=['HyperReal165','CinematicMaximum','UltraPhotoreal','BalancedQuality','SmoothPerformance','PowerSaver'];

test('native UE graphics settings are registered as a project-specific user settings class',()=>{
 assert.match(header,/UCLASS\(Config=GameUserSettings\)/);
 assert.match(header,/class VEILPOINT_API UVPGameUserSettings : public UGameUserSettings/);
 assert.match(engine,/GameUserSettingsClassName=\/Script\/Veilpoint\.VPGameUserSettings/);
 assert.match(defaults,/\[\/Script\/Veilpoint\.VPGameUserSettings\]/);
 assert.match(defaults,/SelectedPreset=HyperReal165/);
});

test('all six named profiles plus Custom are exposed to Blueprint',()=>{
 assert.match(header,/UENUM\(BlueprintType\)/);
 for(const name of [...presets,'Custom'])assert.match(header,new RegExp('\\b'+name+'\\b'));
 for(const name of presets)assert.match(source,new RegExp('case EVPGraphicsPreset::'+name+':'));
 assert.match(header,/UFUNCTION\(BlueprintCallable, Category="VEILPOINT\|Graphics"\)/);
});

test('native profile frame caps and quality levels reflect distinct design goals',()=>{
 const expected={HyperReal165:[4,100,165],CinematicMaximum:[4,100,60],UltraPhotoreal:[3,100,144],BalancedQuality:[2,90,120],SmoothPerformance:[2,80,165],PowerSaver:[1,70,60]};
 for(const [name,[quality,scale,cap]] of Object.entries(expected)){
  const match=source.match(new RegExp('case EVPGraphicsPreset::'+name+':\\s*Out = \\{(\\d+), (\\d+)\\.f, (\\d+)\\.f\\};'));
  assert.ok(match,'Missing native profile '+name);
  assert.deepEqual(match.slice(1).map(Number),[quality,scale,cap]);
 }
 assert.match(source,/1000\.f \/ Cap/);
 assert.match(source,/SetOverallScalabilityLevel\(Spec\.Scalability\)/);
 assert.match(source,/SetResolutionScaleValueEx\(Spec\.ResolutionPercent\)/);
});

test('custom overrides are finite, clamped, applied and optionally saved',()=>{
 assert.match(source,/FMath::IsFinite\(InFPS\)/);
 assert.match(source,/FMath::Clamp\(InFPS, 30\.f, 165\.f\)/);
 assert.match(source,/FMath::IsFinite\(InPercent\)/);
 assert.match(source,/FMath::Clamp\(InPercent, 50\.f, 100\.f\)/);
 assert.match(source,/SetVSyncEnabled\(bEnabled\)/);
 assert.match(source,/ApplySettings\(false\)/);
 assert.match(source,/if \(bPersist\)[\s\S]*?SaveSettings\(\)/);
});

test('native presets remain local and use existing UE high-fidelity renderer features',()=>{
 assert.doesNotMatch(header,/Replicated|NetMulticast|Server,|Client,/);
 assert.match(engine,/r\.Nanite\.ProjectEnabled=True/);
 assert.match(engine,/r\.DynamicGlobalIlluminationMethod=1/);
 assert.match(engine,/r\.ReflectionMethod=1/);
 assert.match(engine,/r\.Shadow\.Virtual\.Enable=1/);
 assert.match(engine,/r\.AntiAliasingMethod=4/);
});
