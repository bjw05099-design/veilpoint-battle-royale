[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$ArchiveDirectory,
      [Parameter(Mandatory=$true)][string]$EvidenceDirectory,
      [switch]$Windowed)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$archive=[IO.Path]::GetFullPath($ArchiveDirectory)
$evidence=[IO.Path]::GetFullPath($EvidenceDirectory)
$game=Join-Path $archive 'Windows/Veilpoint/Binaries/Win64/Veilpoint.exe'
$gameRoot=Join-Path $archive 'Windows/Veilpoint'
$folder=if ($Windowed) { 'WindowVisualSmoke' } else { 'VisualSmoke' }
$captures=Join-Path $gameRoot ('Saved/Automation/'+$folder)
if (!(Test-Path -LiteralPath $game -PathType Leaf)) { throw 'Packaged game binary missing for visual smoke test.' }
if (Test-Path -LiteralPath $captures) { throw 'Visual smoke output already exists; refusing to certify stale images.' }
New-Item -ItemType Directory -Path $evidence -Force | Out-Null
$log=Join-Path $evidence $(if ($Windowed) { 'window-smoke-runtime.log' } else { 'visual-smoke-runtime.log' })
Write-Host "[VEILPOINT] Launching bounded game diagnostic: $folder"
$arguments=@('-unattended','-nosound','-windowed','-ResX=1280','-ResY=720',
    '-VPVisualSmoke',('-abslog="'+$log+'"'))
if ($Windowed) { $arguments+='-VPWindowCapture' } else { $arguments+='-RenderOffscreen' }
$process=Start-Process -FilePath $game -WorkingDirectory (Split-Path -Parent $game) -ArgumentList $arguments -PassThru
try {
    if (!$process.WaitForExit(90000)) {
        # Stop only the diagnostic process started above, never another game/editor.
        Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
        throw 'Offscreen visual smoke exceeded 90 seconds.'
    }
    if ($process.ExitCode -ne 0) { throw "Packaged visual smoke process failed: $($process.ExitCode)" }
} finally {
    if (Test-Path -LiteralPath $captures -PathType Container) {
        Copy-Item -LiteralPath $captures -Destination $evidence -Recurse
    }
    $process.Dispose()
}
$result=Join-Path $captures 'visual-smoke.json'
if (!(Test-Path -LiteralPath $result -PathType Leaf)) { throw 'Game exited without actual viewport evidence.' }
$proof=Get-Content -LiteralPath $result -Raw | ConvertFrom-Json
if ($proof.schema -ne 'veilpoint-native-visual-smoke-v1' -or
    $proof.nativeGameplayDiagnosticPassed -ne $true -or $proof.manualMissionSaveVerified -ne $true -or
    $proof.readbackSucceeded -ne $true -or $proof.menuOpened -ne $true -or
    $proof.offlinePaused -ne $true -or $proof.menuResumed -ne $true -or
    $proof.surfaceMarkPlaced -ne $true -or $proof.surfaceMarkExpired -ne $true -or
    $proof.renderScaleChanged -ne $true -or $proof.renderScaleRestored -ne $true -or
    $proof.originalRenderScale -lt 50 -or $proof.world.map -notmatch 'CH01_Coast$' -or
    $proof.world.upperCentreLuma8bit -lt 3 -or $proof.world.lowerCentreLuma8bit -lt 3 -or
    ($proof.world.upperCentreWhiteFraction -gt 0.95 -and $proof.world.lowerCentreWhiteFraction -gt 0.95)) {
    throw 'Actual viewport/menu/mark smoke check failed. Inspect images and runtime log; no visual pass is claimed.'
}
foreach ($name in @('world','menu','field-mark','sky-view')) {
    $png=Join-Path $captures ($name+'.png')
    if (!(Test-Path -LiteralPath $png -PathType Leaf) -or (Get-Item -LiteralPath $png).Length -lt 1024) {
        throw "Missing or empty actual viewport screenshot: $name"
    }
}
foreach ($frame in @($proof.world,$proof.'sky-view')) {
    if ($frame.cachedLightingPreExposure -ne 8) { throw 'Lumen cache pre-exposure does not match the EV14 daylight configuration.' }
    if ($Windowed -and ($frame.windowPresentationVerified -ne $true -or $frame.redWarningPixels -gt 20)) {
        throw 'Actual game viewport contains a red engine warning, or has no window readback.'
    }
}
$runtimeLog=Get-Content -LiteralPath $log -Raw
if ($runtimeLog -match 'Please fix material usage flag InstancedStaticMeshes') {
    throw 'Packaged civic material lacks its instanced-mesh shader usage; refusing a fallback-material visual pass.'
}
if ($runtimeLog -notmatch 'shaderplatform="PCD3D_SM6"' -or
    $runtimeLog -notmatch 'LogVPDaylight:.*Suns=1 Skies=1 Atmospheres=1') {
    throw 'Runtime did not prove the expected SM6 renderer and authored daylight actors.'
}
Write-Host '[VEILPOINT] Actual offscreen world/menu/mark evidence passed. Human input and GPU performance remain unverified.'
