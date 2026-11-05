'use strict';
// Source-level gate only. GitHub's Linux/Node job cannot run PowerShell UAT
// against a proprietary Windows UE5 installation.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const repo=path.resolve(__dirname,'..');
const read=relative=>fs.readFileSync(path.join(repo,relative),'utf8');
const script=read('scripts/build-native-win64.ps1');
const project=JSON.parse(read('Unreal/Veilpoint/Veilpoint.uproject'));
const engine=read('Unreal/Veilpoint/Config/DefaultEngine.ini');

test('UE5 Windows build gate checks installed engine, project version and native host before UAT',()=>{
 assert.equal(project.EngineAssociation,'5.8');
 assert.match(script,/\$env:OS -ne 'Windows_NT'/);
 assert.match(script,/ConvertFrom-Json/);
 assert.match(script,/EngineAssociation -ne '5\.8'/);
 assert.match(script,/Engine\/Build\/Build\.version/);
 assert.match(script,/Engine\/Build\/BatchFiles\/RunUAT\.bat/);
 assert.match(script,/\$version\.MajorVersion -ne 5 -or \[int\]\$version\.MinorVersion -ne 8/);
});

test('UE5 default map requires authored level or opt-in non-release smoke mode',()=>{
 assert.match(engine,/GameDefaultMap=\/Engine\/Maps\/Entry/);
 assert.match(script,/if \(\$map -eq '\/Engine\/Maps\/Entry'\)/);
 assert.match(script,/if \(\$Configuration -eq 'Shipping'\)/);
 assert.match(script,/stock Engine Entry map is never eligible for a Shipping build/);
 assert.match(script,/if \(!\$AllowEngineEntrySmokeTest\)/);
 assert.match(script,/Fail 'Only the stock Engine Entry map exists\./);
 assert.match(script,/Test-Path -LiteralPath \$mapFile -PathType Leaf/);
 assert.match(script,/Write-Warning 'Engine Entry map smoke test only:/);
});

test('UE5 preflight is non-destructive and never claims native build completion',()=>{
 const preflight=script.indexOf('if ($PreflightOnly)');
 const build=script.indexOf('& $runUat @arguments');
 assert.ok(preflight>0&&build>preflight,'preflight must occur before invoking UAT');
 assert.match(script,/PREFLIGHT PASS; no compilation, package or execution was attempted/);
 assert.match(script,/if \(\$PreflightOnly\) \{[\s\S]*?\breturn\b/);
 assert.match(script,/Unreal BuildCookRun failed \(exit \$uatExit\)/);
 assert.match(script,/UAT returned success but no Veilpoint\.exe was found/);
 assert.doesNotMatch(script,/status='RUNNING'|status='FULLY_TESTED'/);
});

test('UE5 Win64 packaging stages and archive integrity are explicitly checked',()=>{
 for(const flag of ["'-platform=Win64'","'-build'","'-cook'","'-stage'","'-pak'","'-archive'"]){
  assert.ok(script.includes(flag),'missing packaging operation '+flag);
 }
 assert.match(script,/"-clientconfig=\$Configuration"/);
 assert.match(script,/Get-ChildItem -LiteralPath \$archive -Recurse -File -Filter 'Veilpoint\.exe'/);
 assert.match(script,/Get-FileHash -LiteralPath \$file\.FullName -Algorithm SHA256/);
 assert.match(script,/manifest\.json/);
 assert.match(script,/status='PACKAGED_NOT_RUNTIME_TESTED'/);
});

test('UE5 packaging keeps generated files out of the source project and preserves browser demo',()=>{
 assert.match(script,/ArchiveDirectory must be outside the source Unreal project/);
 assert.match(script,/dist\/native-win64/);
 assert.match(script,/dist\/native-build-logs/);
 assert.match(read('.gitignore'),/^dist\/$/m);
 assert.doesNotMatch(script,/npm publish|curl|Invoke-WebRequest|Start-Process.*Veilpoint\.exe/);
});
