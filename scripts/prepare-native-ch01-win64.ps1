# VEILPOINT 5.8: compile native editor, author physical CH01 .umap, then
# configure that VERIFIED map as the standalone story's startup level.
# This is an opt-in LOCAL Windows/Unreal operation, not a GitHub CI launch.
[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$EngineRoot,
    [switch]$PreflightOnly,
    [switch]$PackageNative
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
function Fail([string]$Reason) { throw "[VEILPOINT native CH01] $Reason" }
if ($env:OS -ne 'Windows_NT') {
    Fail 'Native authoring requires installed Unreal 5.8 on Windows. No map was generated.'
}
. (Join-Path $PSScriptRoot 'build-pc-native-prerequisites.ps1')

$repo=(Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$project=Join-Path $repo 'Unreal/Veilpoint/Veilpoint.uproject'
$config=Join-Path $repo 'Unreal/Veilpoint/Config/DefaultEngine.ini'
$author=Join-Path $repo 'scripts/ue5-author-ch01-map.py'
$layout=Join-Path $repo 'scripts/ch01-original-public-court.json'
$broadcastLayout=Join-Path $repo 'scripts/ch01-last-broadcast-layout.json'
$map=Join-Path $repo 'Unreal/Veilpoint/Content/Maps/CH01_Coast.umap'
$adenMap=Join-Path $repo 'Unreal/Veilpoint/Content/Maps/CH01_Aden.umap'
$saved=Join-Path $repo 'Unreal/Veilpoint/Saved'
$receipt=Join-Path $saved 'CH01_MAP_READY.json'
$adenReceipt=Join-Path $saved 'Veilpoint/ch01-aden-map-receipt.json'
$engine=[IO.Path]::GetFullPath($EngineRoot)
$versionPath=Join-Path $engine 'Engine/Build/Build.version'
$buildBat=Join-Path $engine 'Engine/Build/BatchFiles/Build.bat'
$editor=Join-Path $engine 'Engine/Binaries/Win64/UnrealEditor-Cmd.exe'

foreach ($file in @($project,$config,$author,$layout,$versionPath,$buildBat,$editor)) {
    if (!(Test-Path -LiteralPath $file -PathType Leaf)) {
        Fail "Required UE5 source, engine or authoring file missing: $file"
    }
}
$projectInfo=Get-Content -LiteralPath $project -Raw | ConvertFrom-Json
$version=Get-Content -LiteralPath $versionPath -Raw | ConvertFrom-Json
if ($projectInfo.EngineAssociation -ne '5.8' -or
    [int]$version.MajorVersion -ne 5 -or [int]$version.MinorVersion -ne 8) {
    Fail 'UE5 project and installed engine must BOTH use 5.8.'
}
$source=Get-Content -LiteralPath $config -Raw
if ($source -notmatch '(?m)^GameDefaultMap=/Engine/Maps/Entry\s*$') {
    Fail 'Source game map differs from the original safe Entry default; do not overwrite custom settings.'
}
if ((Test-Path -LiteralPath $map) -or (Test-Path -LiteralPath $adenMap)) {
    Fail 'A CH01_Coast.umap already exists; review it in Unreal Editor. Never overwrite authored map assets.'
}
if ((Test-Path -LiteralPath $receipt) -or (Test-Path -LiteralPath $adenReceipt)) {
    Fail 'A CH01 authoring receipt already exists; inspect before attempting a new run.'
}
$data=Get-Content -LiteralPath $layout -Raw | ConvertFrom-Json
if ($data.format -ne 'veilpoint-ch01-original-public-court-v1' -or
    $data.coordinateSystem -ne 'unreferenced-native-ue-centimetres' -or
    $data.actualAdenCoverageVerified -ne $false -or
    $data.restrictedOperationalSites -ne $false -or
    $data.pieces.Count -ne 11) {
    Fail 'Original non-sensitive CH01 court input is missing or invalid.'
}
Assert-BuildPcNetFxSdk
if ($PreflightOnly) {
    Write-Host '[VEILPOINT] CH01 PRE-FLIGHT READY; Unreal editor build, map generation, configuration and packaging NOT attempted.'
    Write-Host "[VEILPOINT] Installed UE5: $engine"
    return
}

New-Item -ItemType Directory -Path $saved -Force | Out-Null
$logFolder=Join-Path $repo 'dist/native-build-logs'
New-Item -ItemType Directory -Path $logFolder -Force | Out-Null
$stamp=[DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss')
$buildLog=Join-Path $logFolder "ch01-editor-$stamp.log"
$authorLog=Join-Path $logFolder "ch01-author-$stamp.log"
# A successful Win64 WebView2 EXE build does not compile the UE5 C++ module.
# Invoke the project-specific UnrealBuildTool Editor target first.
Write-Host '[VEILPOINT] Compiling VeilpointEditor Win64 Development using installed UE5...'
$before=$ErrorActionPreference
$ErrorActionPreference='Continue'
try {
    & $buildBat 'VeilpointEditor' 'Win64' 'Development' "-Project=$project" '-WaitMutex' '-NoHotReload' '-MaxParallelActions=2' 2>&1 |
        Tee-Object -FilePath $buildLog
    $buildExit=$LASTEXITCODE
}
finally { $ErrorActionPreference=$before }
if ($buildExit -ne 0) { Fail "Native Editor C++ build failed ($buildExit); review $buildLog. No map created." }

# Export the editable committed radio with the already installed Blender.
# Per-part visual+UCX files avoid the FBX multi-mesh collision limitation.
$toolRoot=if ([string]::IsNullOrWhiteSpace($env:VEILPOINT_TOOL_ROOT)) { Join-Path $repo '.tools' } else { $env:VEILPOINT_TOOL_ROOT }
$toolPaths=Get-Content -LiteralPath (Join-Path $toolRoot 'paths.json') -Raw | ConvertFrom-Json
$blender=[string]$toolPaths.blender
if (!(Test-Path -LiteralPath $blender -PathType Leaf)) { Fail 'Installed Blender is required for the original radio export.' }
$radioSource=Join-Path $repo 'Unreal/Veilpoint/ContentSource/LastBroadcast/radio-desk.blend'
$radioExport=Join-Path $repo 'dist/game-assets/ch01-radio-native'
$before=$ErrorActionPreference
$ErrorActionPreference='Continue'
try {
    & $blender '--background' '--factory-startup' '--threads' '2' '--python-exit-code' '1' '--python' (Join-Path $repo 'scripts/blender-export-ch01-radio.py') '--' $radioSource $radioExport 2>&1 |
        Tee-Object -FilePath (Join-Path $logFolder 'ch01-radio-blender.log')
    $radioExit=$LASTEXITCODE
} finally { $ErrorActionPreference=$before }
if ($radioExit -ne 0) { Fail 'Actual Blender radio FBX/UCX export failed.' }

Write-Host '[VEILPOINT] Running documented UnrealEditor-Cmd.exe ExecutePythonScript authoring...'
$before=$ErrorActionPreference
$ErrorActionPreference='Continue'
try {
    & $editor $project "-ExecutePythonScript=`"$author`"" '-Unattended' '-NoSplash' '-NoSound' '-stdout' '-FullStdOutLogOutput' 2>&1 |
        Tee-Object -FilePath $authorLog
    $editorExit=$LASTEXITCODE
}
finally { $ErrorActionPreference=$before }
if ($editorExit -ne 0) {
    Fail "Native editor authoring failed ($editorExit). Inspect $authorLog and any partial .umap MANUALLY; no map configuration changed."
}
if (!(Test-Path -LiteralPath $map -PathType Leaf) -or
    !(Test-Path -LiteralPath $receipt -PathType Leaf)) {
    Fail 'Editor exited without BOTH a real CH01 .umap and source-bound authoring receipt; map configuration unchanged.'
}
$proof=Get-Content -LiteralPath $receipt -Raw | ConvertFrom-Json
Copy-Item -LiteralPath $receipt -Destination (Join-Path $logFolder 'ch01-map-receipt.json')
$observedMapBytes=(Get-Item -LiteralPath $map).Length
$mapSha=(Get-FileHash -LiteralPath $map -Algorithm SHA256).Hash.ToLowerInvariant()
$layoutSha=(Get-FileHash -LiteralPath $layout -Algorithm SHA256).Hash.ToLowerInvariant()
$broadcastLayoutSha=(Get-FileHash -LiteralPath $broadcastLayout -Algorithm SHA256).Hash.ToLowerInvariant()
if ($proof.lastBroadcast.savedReloadVerified -ne $true -or $proof.lastBroadcast.savedCollisionProfilesVerified -ne $true -or
    $proof.lastBroadcast.layoutSha256 -cne $broadcastLayoutSha -or
    $proof.lastBroadcast.radioVisualMeshes -ne 9 -or $proof.lastBroadcast.radioConvexColliders -ne 9 -or
    $proof.lastBroadcast.radioSourceSha256 -cne (Get-FileHash -LiteralPath $radioSource -Algorithm SHA256).Hash.ToLowerInvariant()) {
    Fail 'Last Broadcast map/radio authoring receipt is incomplete or stale.'
}
if ($proof.format -ne 'veilpoint-ch01-map-authoring-proof-v1' -or
    $proof.mapPackage -ne '/Game/Maps/CH01_Coast' -or
    ![IO.Path]::IsPathRooted([string]$proof.mapFile) -or
    [IO.Path]::GetFullPath([string]$proof.mapFile) -ne [IO.Path]::GetFullPath($map) -or
    $observedMapBytes -lt 2048 -or
    [int64]$proof.mapBytes -ne $observedMapBytes -or
    $proof.mapSha256 -cne $mapSha -or
    $proof.sourceLayoutSha256 -cne $layoutSha -or
    [int]$proof.authoredCivilianActors -ne 11 -or
    $proof.authoringMode -ne '/Script/Veilpoint.VPStoryGameMode' -or
    $proof.nativePIEVerified -ne $false -or
    $proof.nativeWin64Packaged -ne $false -or
    $proof.actualAdenCoverageVerified -ne $false) {
    Write-Host ($proof | ConvertTo-Json -Depth 8)
    Write-Host "[VEILPOINT] Observed map: $map; bytes: $observedMapBytes; SHA256: $mapSha; layout SHA256: $layoutSha"
    Fail 'Unreal editor map receipt fails byte-level verification. Refusing to change startup map.'
}

if (!(Test-Path -LiteralPath $adenMap -PathType Leaf) -or !(Test-Path -LiteralPath $adenReceipt -PathType Leaf)) {
    Fail 'The Unreal Editor did not generate the native sourced Aden map and receipt.'
}
Copy-Item -LiteralPath $adenReceipt -Destination (Join-Path $logFolder 'ch01-aden-map-receipt.json')
$adenProof=Get-Content -LiteralPath $adenReceipt -Raw | ConvertFrom-Json
$adenSha=(Get-FileHash -LiteralPath $adenMap -Algorithm SHA256).Hash.ToLowerInvariant()
if ($adenProof.schema -ne 'veilpoint-native-aden-authoring-v1' -or
    $adenProof.map -ne '/Game/Maps/CH01_Aden' -or $adenProof.gameMode -ne '/Script/Veilpoint.VPAdenStoryGameMode' -or
    $adenProof.savedReloadVerified -ne $true -or $adenProof.sourceActorCount -ne 1 -or $adenProof.atlasTextureCount -ne 2 -or
    $adenProof.mapSha256 -cne $adenSha -or [int64]$adenProof.mapBytes -ne (Get-Item -LiteralPath $adenMap).Length) {
    Fail 'Sourced Aden map receipt fails byte-level verification.'
}

# Preserve the prior config in ignored Saved/ so it can be restored manually.
$backup=Join-Path $saved "DefaultEngine.before-CH01-$stamp.ini"
[IO.File]::WriteAllText($backup,$source,[Text.UTF8Encoding]::new($false))
$revised=[regex]::Replace($source,'(?m)^GameDefaultMap=/Engine/Maps/Entry(?=\r?$)',
                           'GameDefaultMap=/Game/Maps/CH01_Aden')
if ($revised -eq $source) { Fail 'Could not safely locate stock map setting; no changes committed.' }
$revised=[regex]::Replace($revised,'(?m)^EditorStartupMap=/Engine/Maps/Entry(?=\r?$)',
                           'EditorStartupMap=/Game/Maps/CH01_Aden')
[IO.File]::WriteAllText($config,$revised,[Text.UTF8Encoding]::new($false))
Write-Host "[VEILPOINT] Verified native sourced Aden and enabled CH01_Aden story startup."
Write-Host "[VEILPOINT] Config backup: $backup"
Write-Host "[VEILPOINT] Author receipt: $receipt"
Write-Host '[VEILPOINT] UE5 editor C++ compile and asset authoring succeeded LOCALLY; playable PIE is still UNVERIFIED.'

if ($PackageNative) {
    & (Join-Path $PSScriptRoot 'build-native-win64.ps1') -EngineRoot $engine -Configuration Development
    if (!$?) { Fail 'Native BuildCookRun failed. Check saved logs; do not claim a playable build.' }
    Write-Host '[VEILPOINT] Native Win64 PACKAGE candidate built. Actual game launch and frame timings are UNVERIFIED.'
}
