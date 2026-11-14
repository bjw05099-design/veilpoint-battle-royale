# GitHub-hosted Windows checks. Fake engine fixtures NEVER claim a native build.
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$repo=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$names=@('setup-game-dev.ps1','connect-build-pc.ps1','start-build-pc.ps1','run-native-pc-job.ps1')
foreach ($name in $names) {
    $tokens=$null; $errors=$null
    [void][System.Management.Automation.Language.Parser]::ParseFile((Join-Path $repo "scripts/$name"),[ref]$tokens,[ref]$errors)
    if ($errors.Count -gt 0) { throw "PowerShell parse failure in $name`: $errors" }
}
$before=$env:VEILPOINT_TOOL_ROOT
& (Join-Path $repo 'scripts/setup-game-dev.ps1')
if ($env:VEILPOINT_TOOL_ROOT -cne $before) { throw 'Plan-only setup changed the tool environment.' }
$temporary=Join-Path ([IO.Path]::GetTempPath()) ('veilpoint-tools-test-'+[Guid]::NewGuid().ToString('N'))
try {
    $fixture=Join-Path $temporary 'project'
    $engine=Join-Path $temporary 'engine'
    foreach ($directory in @('scripts','Unreal/Veilpoint/Config')) { New-Item -ItemType Directory -Force (Join-Path $fixture $directory) | Out-Null }
    foreach ($directory in @('Engine/Build/BatchFiles','Engine/Binaries/Win64')) { New-Item -ItemType Directory -Force (Join-Path $engine $directory) | Out-Null }
    foreach ($name in @('run-native-pc-job.ps1','prepare-native-ch01-win64.ps1','ue5-author-ch01-map.py','ch01-original-public-court.json')) {
        Copy-Item -LiteralPath (Join-Path $repo "scripts/$name") -Destination (Join-Path $fixture "scripts/$name")
    }
    [IO.File]::WriteAllText((Join-Path $fixture 'Unreal/Veilpoint/Veilpoint.uproject'),'{"EngineAssociation":"5.8"}')
    [IO.File]::WriteAllText((Join-Path $fixture 'Unreal/Veilpoint/Config/DefaultEngine.ini'),"GameDefaultMap=/Engine/Maps/Entry`n")
    [IO.File]::WriteAllText((Join-Path $engine 'Engine/Build/Build.version'),'{"MajorVersion":5,"MinorVersion":7}')
    $rejected=$false
    try { & (Join-Path $fixture 'scripts/run-native-pc-job.ps1') -EngineRoot $engine -Operation preflight }
    catch { $rejected=$_.Exception.Message -like '*requires Unreal 5.8*' }
    if (!$rejected) { throw 'A mismatched engine version was not rejected.' }
    [IO.File]::WriteAllText((Join-Path $engine 'Engine/Build/Build.version'),'{"MajorVersion":5,"MinorVersion":8}')
    [IO.File]::WriteAllText((Join-Path $engine 'Engine/Build/BatchFiles/Build.bat'),"@echo off`r`nexit /b 0`r`n")
    [IO.File]::WriteAllText((Join-Path $engine 'Engine/Binaries/Win64/UnrealEditor-Cmd.exe'),'NOT AN ENGINE; never executed')
    & git -C $fixture init --quiet
    if ($LASTEXITCODE -ne 0) { throw 'Fixture git init failed.' }
    & git -C $fixture add .
    if ($LASTEXITCODE -ne 0) { throw 'Fixture staging failed.' }
    & git -C $fixture -c user.name=Fixture -c user.email=fixture@example.invalid -c commit.gpgsign=false commit --quiet -m fixture
    if ($LASTEXITCODE -ne 0) { throw 'Fixture commit failed.' }
    $rejected=$false
    try { & (Join-Path $fixture 'scripts/run-native-pc-job.ps1') -EngineRoot $engine -Operation compile }
    catch { $rejected=$_.Exception.Message -like '*without the native Veilpoint Editor module*' }
    if (!$rejected) { throw 'Exit zero without an Editor DLL must not claim compile success.' }
    $report=Get-Content (Join-Path $fixture 'dist/game-dev/native-job.json') -Raw | ConvertFrom-Json
    if ($report.status -ne 'FAILED' -or $report.nativeRuntimeVerified -ne $false) { throw 'Failure receipt was misleading.' }
    Write-Host 'Windows setup syntax, plan-only mode, engine mismatch and false build-success guards PASS. No Unreal binary was compiled.'
} finally {
    if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary -Recurse -Force }
}
