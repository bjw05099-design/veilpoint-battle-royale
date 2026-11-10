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

$repo=(Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$project=Join-Path $repo 'Unreal/Veilpoint/Veilpoint.uproject'
$config=Join-Path $repo 'Unreal/Veilpoint/Config/DefaultEngine.ini'
$author=Join-Path $repo 'scripts/ue5-author-ch01-map.py'
$layout=Join-Path $repo 'scripts/ch01-original-public-court.json'
$map=Join-Path $repo 'Unreal/Veilpoint/Content/Maps/CH01_Coast.umap'
$saved=Join-Path $repo 'Unreal/Veilpoint/Saved'
$receipt=Join-Path $saved 'CH01_MAP_READY.json'
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
if (Test-Path -LiteralPath $map) {
    Fail 'A CH01_Coast.umap already exists; review it in Unreal Editor. Never overwrite authored map assets.'
}
if (Test-Path -LiteralPath $receipt) {
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
    & $buildBat 'VeilpointEditor' 'Win64' 'Development' "-Project=$project" '-WaitMutex' '-NoHotReload' 2>&1 |
        Tee-Object -FilePath $buildLog
    $buildExit=$LASTEXITCODE
}
finally { $ErrorActionPreference=$before }
if ($buildExit -ne 0) { Fail "Native Editor C++ build failed ($buildExit); review $buildLog. No map created." }

Write-Host '[VEILPOINT] Running documented UnrealEditor-Cmd.exe ExecutePythonScript authoring...'
$before=$ErrorActionPreference
$ErrorActionPreference='Continue'
try {
    & $editor $project "-ExecutePythonScript=`"$author`"" '-Unattended' '-NoSplash' '-NoSound' 2>&1 |
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
$observedMapBytes=(Get-Item -LiteralPath $map).Length
$mapSha=(Get-FileHash -LiteralPath $map -Algorithm SHA256).Hash.ToLowerInvariant()
$layoutSha=(Get-FileHash -LiteralPath $layout -Algorithm SHA256).Hash.ToLowerInvariant()
if ($proof.format -ne 'veilpoint-ch01-map-authoring-proof-v1' -or
    $proof.mapPackage -ne '/Game/Maps/CH01_Coast' -or
    $proof.mapFile -ne $map -or
    $observedMapBytes -lt 2048 -or
    [int64]$proof.mapBytes -ne $observedMapBytes -or
    $proof.mapSha256 -cne $mapSha -or
    $proof.sourceLayoutSha256 -cne $layoutSha -or
    [int]$proof.authoredCivilianActors -ne 11 -or
    $proof.authoringMode -ne '/Script/Veilpoint.VPStoryGameMode' -or
    $proof.nativePIEVerified -ne $false -or
    $proof.nativeWin64Packaged -ne $false -or
    $proof.actualAdenCoverageVerified -ne $false) {
    Fail 'Unreal editor map receipt fails byte-level verification. Refusing to change startup map.'
}

# Preserve the prior config in ignored Saved/ so it can be restored manually.
$backup=Join-Path $saved "DefaultEngine.before-CH01-$stamp.ini"
[IO.File]::WriteAllText($backup,$source,[Text.UTF8Encoding]::new($false))
$revised=[regex]::Replace($source,'(?m)^GameDefaultMap=/Engine/Maps/Entry$',
                           'GameDefaultMap=/Game/Maps/CH01_Coast')
if ($revised -eq $source) { Fail 'Could not safely locate stock map setting; no changes committed.' }
[IO.File]::WriteAllText($config,$revised,[Text.UTF8Encoding]::new($false))
Write-Host "[VEILPOINT] Verified physical CH01 map + 11 civic actors and enabled story startup."
Write-Host "[VEILPOINT] Config backup: $backup"
Write-Host "[VEILPOINT] Author receipt: $receipt"
Write-Host '[VEILPOINT] UE5 editor C++ compile and asset authoring succeeded LOCALLY; playable PIE is still UNVERIFIED.'

if ($PackageNative) {
    & (Join-Path $PSScriptRoot 'build-native-win64.ps1') -EngineRoot $engine -Configuration Development
    if (!$?) { Fail 'Native BuildCookRun failed. Check saved logs; do not claim a playable build.' }
    Write-Host '[VEILPOINT] Native Win64 PACKAGE candidate built. Actual game launch and frame timings are UNVERIFIED.'
}
