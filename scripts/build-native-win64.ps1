# VEILPOINT Windows Unreal Engine native build and packaging gate.
# This script does not claim to compile UE5 on a Linux/Node CI runner.
# Example: .\scripts\build-native-win64.ps1 -EngineRoot "C:\Program Files\Epic Games\UE_5.8" -PreflightOnly -AllowEngineEntrySmokeTest
[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$EngineRoot,
    [ValidateSet('Development','Shipping')][string]$Configuration='Development',
    [string]$ArchiveDirectory='',
    [switch]$PreflightOnly,
    [switch]$AllowEngineEntrySmokeTest
)

Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
function Fail([string]$Reason) { throw "[VEILPOINT UE5 Win64] $Reason" }

if ($env:OS -ne 'Windows_NT') {
    Fail 'A Windows machine with locally installed Unreal Engine 5.8 is required. No binary was built.'
}

$repo=(Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$project=Join-Path $repo 'Unreal/Veilpoint/Veilpoint.uproject'
$config=Join-Path $repo 'Unreal/Veilpoint/Config/DefaultEngine.ini'
if (!(Test-Path -LiteralPath $project -PathType Leaf)) { Fail "Project missing: $project" }
if (!(Test-Path -LiteralPath $config -PathType Leaf)) { Fail "Config missing: $config" }

$projectInfo=Get-Content -LiteralPath $project -Raw | ConvertFrom-Json
if ($projectInfo.EngineAssociation -ne '5.8') {
    Fail "Project requests Unreal $($projectInfo.EngineAssociation), not the verified 5.8 development target."
}
$engineFull=[IO.Path]::GetFullPath($EngineRoot)
$runUat=Join-Path $engineFull 'Engine/Build/BatchFiles/RunUAT.bat'
$buildVersion=Join-Path $engineFull 'Engine/Build/Build.version'
if (!(Test-Path -LiteralPath $runUat -PathType Leaf)) { Fail "RunUAT.bat missing: $runUat" }
if (!(Test-Path -LiteralPath $buildVersion -PathType Leaf)) { Fail "Engine Build.version missing: $buildVersion" }
$version=Get-Content -LiteralPath $buildVersion -Raw | ConvertFrom-Json
if ([int]$version.MajorVersion -ne 5 -or [int]$version.MinorVersion -ne 8) {
    Fail "Installed engine is $($version.MajorVersion).$($version.MinorVersion); expected 5.8. No build attempted."
}

$mapSetting=Get-Content -LiteralPath $config |
    Where-Object { $_ -match '^\s*GameDefaultMap\s*=' } | Select-Object -First 1
if (!$mapSetting) { Fail 'GameDefaultMap is missing; a packaged build could start blank.' }
$map=($mapSetting -split '=',2)[1].Trim()
if ($map -eq '/Engine/Maps/Entry') {
    if ($Configuration -eq 'Shipping') {
        Fail 'The stock Engine Entry map is never eligible for a Shipping build. Author and configure a real playable level.'
    }
    if (!$AllowEngineEntrySmokeTest) {
        Fail 'Only the stock Engine Entry map exists. Author a playable /Game/... .umap before a release build. For an explicitly non-release compile smoke test use -AllowEngineEntrySmokeTest.'
    }
    Write-Warning 'Engine Entry map smoke test only: not an authored playable level or accepted release!'
}
elseif ($map -match '^/Game/([A-Za-z0-9_/]+)$') {
    $mapRelative=$Matches[1].Replace('/',[IO.Path]::DirectorySeparatorChar)
    $mapFile=Join-Path $repo ("Unreal/Veilpoint/Content/$mapRelative.umap")
    if (!(Test-Path -LiteralPath $mapFile -PathType Leaf)) {
        Fail "Configured game map is missing: $mapFile"
    }
    # CH01's editor-generated map must carry its source-bound, byte-exact
    # authoring receipt. A renamed/corrupted .umap must never pass cook gate.
    if ($map -eq '/Game/Maps/CH01_Coast') {
        $proofPath=Join-Path $repo 'Unreal/Veilpoint/Saved/CH01_MAP_READY.json'
        $layout=Join-Path $repo 'scripts/ch01-original-public-court.json'
        if (!(Test-Path -LiteralPath $proofPath -PathType Leaf) -or
            !(Test-Path -LiteralPath $layout -PathType Leaf)) {
            Fail 'CH01 map is missing its UE5 editor authoring receipt and original geometry.'
        }
        $proof=Get-Content -LiteralPath $proofPath -Raw | ConvertFrom-Json
        $mapDigest=(Get-FileHash -LiteralPath $mapFile -Algorithm SHA256).Hash.ToLowerInvariant()
        $layoutDigest=(Get-FileHash -LiteralPath $layout -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($proof.format -ne 'veilpoint-ch01-map-authoring-proof-v1' -or
            $proof.mapPackage -ne $map -or
            $proof.mapSha256 -cne $mapDigest -or
            $proof.sourceLayoutSha256 -cne $layoutDigest -or
            [int64]$proof.mapBytes -ne (Get-Item -LiteralPath $mapFile).Length -or
            [int]$proof.authoredCivilianActors -ne 11 -or
            $proof.authoringMode -ne '/Script/Veilpoint.VPStoryGameMode' -or
            $proof.actualAdenCoverageVerified -ne $false -or
            $proof.nativePIEVerified -ne $false) {
            Fail 'CH01 authored map receipt mismatch. Refusing cook/package of unverified level.'
        }
    }
    if ($map -eq '/Game/Maps/CH01_Aden') {
        $proofPath=Join-Path $repo 'Unreal/Veilpoint/Saved/Veilpoint/ch01-aden-map-receipt.json'
        if (!(Test-Path -LiteralPath $proofPath -PathType Leaf)) { Fail 'Missing native Aden authoring receipt.' }
        $proof=Get-Content -LiteralPath $proofPath -Raw | ConvertFrom-Json
        $mapDigest=(Get-FileHash -LiteralPath $mapFile -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($proof.schema -ne 'veilpoint-native-aden-authoring-v1' -or $proof.map -ne $map -or
            $proof.gameMode -ne '/Script/Veilpoint.VPAdenStoryGameMode' -or $proof.savedReloadVerified -ne $true -or
            $proof.sourceActorCount -ne 1 -or $proof.atlasTextureCount -ne 4 -or $proof.groundDetailTextures -ne 3 -or $proof.fieldAudioCount -ne 5 -or
        $proof.fieldStationSaved -ne $true -or $proof.mapSha256 -cne $mapDigest -or
            [int64]$proof.mapBytes -ne (Get-Item -LiteralPath $mapFile).Length) {
            Fail 'Native Aden map receipt mismatch. Refusing cook/package of the unverified level.'
        }
    }
}
else { Fail "GameDefaultMap is not a supported authored /Game/ map: $map" }

if ([string]::IsNullOrWhiteSpace($ArchiveDirectory)) {
    $ArchiveDirectory=Join-Path $repo 'dist/native-win64'
}
$archive=[IO.Path]::GetFullPath($ArchiveDirectory)
$nativeProject=[IO.Path]::GetFullPath((Join-Path $repo 'Unreal/Veilpoint'))
if ($archive.TrimEnd('\','/') -eq $nativeProject.TrimEnd('\','/') -or
    $archive.StartsWith($nativeProject.TrimEnd('\','/') + [IO.Path]::DirectorySeparatorChar,
        [StringComparison]::OrdinalIgnoreCase)) {
    Fail 'ArchiveDirectory must be outside the source Unreal project.'
}

$cookMaps=$map
if ($map -eq '/Game/Maps/CH01_Aden' -and $Configuration -eq 'Development') {
    $cookMaps+='+/Game/Maps/CH01_Coast+/Game/Maps/BR_Development'
}
$arguments=@(
    'BuildCookRun',
    "-project=$project",
    '-noP4',
    '-platform=Win64',
    "-clientconfig=$Configuration",
    '-build', '-cook', "-map=$cookMaps", '-stage', '-pak', '-archive',
    "-archivedirectory=$archive"
)

Write-Host "[VEILPOINT] Unreal 5.8 Win64 $Configuration"
Write-Host "[VEILPOINT] Map: $map"
Write-Host "[VEILPOINT] Archive: $archive"
if ($PreflightOnly) {
    Write-Host '[VEILPOINT] PREFLIGHT PASS; no compilation, package or execution was attempted.'
    return
}

$logs=Join-Path $repo 'dist/native-build-logs'
New-Item -ItemType Directory -Path $logs -Force | Out-Null
New-Item -ItemType Directory -Path $archive -Force | Out-Null
$logFile=Join-Path $logs ('build-'+[DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss')+'.log')
Write-Host "[VEILPOINT] Running UAT; full log: $logFile"
# UAT's stderr messages may include non-fatal compiler output. Always judge
# the native process exit code, not a keyword in its printed text.
$priorPreference=$ErrorActionPreference
$ErrorActionPreference='Continue'
try {
    & $runUat @arguments 2>&1 | Tee-Object -FilePath $logFile
    $uatExit=$LASTEXITCODE
} finally {
    $ErrorActionPreference=$priorPreference
}
if ($uatExit -ne 0) {
    Fail "Unreal BuildCookRun failed (exit $uatExit). Inspect $logFile. No verified .exe is claimed."
}

$executables=@(Get-ChildItem -LiteralPath $archive -Recurse -File -Filter 'Veilpoint.exe')
if ($executables.Count -lt 1) {
    Fail "UAT returned success but no Veilpoint.exe was found in $archive. Packaging is NOT verified."
}
$windowsRoot=Join-Path $archive 'Windows'
if (Test-Path -LiteralPath (Join-Path $windowsRoot 'Veilpoint.exe') -PathType Leaf) {
    # Keep log discovery beside the copied package, including OneDrive desktops.
    # ASCII helpers avoid Windows PowerShell 5.1/cmd encoding ambiguity.
    @'
@echo off
setlocal
if not exist "%~dp0Veilpoint\Saved\Logs" mkdir "%~dp0Veilpoint\Saved\Logs"
start "" "%~dp0Veilpoint.exe" -abslog="%~dp0Veilpoint\Saved\Logs\Veilpoint.log"
'@ | Set-Content -LiteralPath (Join-Path $windowsRoot 'PLAY_VEILPOINT.cmd') -Encoding ASCII
    @'
@echo off
if exist "%~dp0Veilpoint\Saved\Logs" (
  start "" explorer.exe "%~dp0Veilpoint\Saved\Logs"
) else (
  echo Run PLAY_VEILPOINT.cmd first, then open logs again.
  pause
)
'@ | Set-Content -LiteralPath (Join-Path $windowsRoot 'OPEN_LOGS.cmd') -Encoding ASCII
    [ordered]@{schema='veilpoint-packaged-build-v1';sourceSha=(git -C $repo rev-parse HEAD);map=$map;engine='5.8';humanInputVerified=$false} |
        ConvertTo-Json | Set-Content -LiteralPath (Join-Path $windowsRoot 'BUILD_INFO.json') -Encoding UTF8
}
$manifest=@()
$packed=@(Get-ChildItem -LiteralPath $archive -File -Recurse | Where-Object {
    $_.Extension -in @('.exe','.pak','.utoc','.ucas')
} | Sort-Object FullName)
foreach ($file in $packed) {
    $hash=Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256
    $relative=$file.FullName.Substring($archive.Length).TrimStart('\','/')
    $manifest+= [pscustomobject]@{
        path=$relative.Replace('\','/')
        bytes=$file.Length
        sha256=$hash.Hash.ToLowerInvariant()
    }
}
if ($manifest.Count -eq 0) { Fail 'No packaged executable/content file was found.' }
$report=[ordered]@{
    status='PACKAGED_NOT_RUNTIME_TESTED'
    engine='5.8'
    configuration=$Configuration
    map=$map
    engineEntrySmokeTest=[bool]$AllowEngineEntrySmokeTest
    createdAtUtc=[DateTime]::UtcNow.ToString('o')
    executableCount=$executables.Count
    files=$manifest
}
$reportFile=Join-Path $archive 'veilpoint-win64-manifest.json'
$report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $reportFile -Encoding UTF8
Write-Host "[VEILPOINT] Package files verified by SHA256. Manifest: $reportFile"
Write-Host '[VEILPOINT] Not yet verified: executable launch, native map gameplay, multiplayer PIE and GPU FPS.'
