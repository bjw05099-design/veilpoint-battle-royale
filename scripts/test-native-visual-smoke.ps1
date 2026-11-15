[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$ArchiveDirectory,
      [Parameter(Mandatory=$true)][string]$EvidenceDirectory)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$archive=[IO.Path]::GetFullPath($ArchiveDirectory)
$evidence=[IO.Path]::GetFullPath($EvidenceDirectory)
$game=Join-Path $archive 'Windows/Veilpoint/Binaries/Win64/Veilpoint.exe'
$gameRoot=Join-Path $archive 'Windows/Veilpoint'
$captures=Join-Path $gameRoot 'Saved/Automation/VisualSmoke'
if (!(Test-Path -LiteralPath $game -PathType Leaf)) { throw 'Packaged game binary missing for visual smoke test.' }
if (Test-Path -LiteralPath $captures) { throw 'Visual smoke output already exists; refusing to certify stale images.' }
New-Item -ItemType Directory -Path $evidence -Force | Out-Null
$log=Join-Path $evidence 'visual-smoke-runtime.log'
Write-Host '[VEILPOINT] Launching the packaged game OFFSCREEN for bounded render/menu/mark checks.'
$process=Start-Process -FilePath $game -WorkingDirectory (Split-Path -Parent $game) -ArgumentList @(
    '-RenderOffscreen','-unattended','-nosound','-windowed','-ResX=1280','-ResY=720',
    '-VPVisualSmoke',('-abslog="'+$log+'"')) -PassThru
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
    $proof.readbackSucceeded -ne $true -or $proof.menuOpened -ne $true -or
    $proof.offlinePaused -ne $true -or $proof.menuResumed -ne $true -or
    $proof.surfaceMarkPlaced -ne $true -or $proof.surfaceMarkExpired -ne $true -or
    $proof.renderScaleChanged -ne $true -or $proof.renderScaleRestored -ne $true -or
    $proof.originalRenderScale -lt 50 -or $proof.world.map -notmatch 'CH01_Coast$' -or
    $proof.world.upperCentreLuma8bit -lt 3 -or $proof.world.lowerCentreLuma8bit -lt 3) {
    throw 'Actual viewport/menu/mark smoke check failed. Inspect images and runtime log; no visual pass is claimed.'
}
foreach ($name in @('world','menu','field-mark')) {
    $png=Join-Path $captures ($name+'.png')
    if (!(Test-Path -LiteralPath $png -PathType Leaf) -or (Get-Item -LiteralPath $png).Length -lt 1024) {
        throw "Missing or empty actual viewport screenshot: $name"
    }
}
$runtimeLog=Get-Content -LiteralPath $log -Raw
if ($runtimeLog -notmatch 'shaderplatform="PCD3D_SM6"' -or
    $runtimeLog -notmatch 'LogVPDaylight:.*Suns=1 Skies=1 Atmospheres=1') {
    throw 'Runtime did not prove the expected SM6 renderer and authored daylight actors.'
}
Write-Host '[VEILPOINT] Actual offscreen world/menu/mark evidence passed. Human input and GPU performance remain unverified.'
