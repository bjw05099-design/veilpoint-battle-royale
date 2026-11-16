[CmdletBinding()]
param([string]$PackageRoot=$PSScriptRoot,[switch]$InspectOnly)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath($PackageRoot).TrimEnd([IO.Path]::DirectorySeparatorChar)
$pointer=Join-Path $root 'latest-verified.json'
if (!(Test-Path -LiteralPath $pointer -PathType Leaf)) { throw 'No verified native package is available yet.' }
$latest=Get-Content -LiteralPath $pointer -Raw | ConvertFrom-Json
if ($latest.sourceSha -cnotmatch '^[0-9a-f]{40}$' -or $latest.offscreenRenderVerified -ne $true -or $latest.windowRenderVerified -ne $true) {
    throw 'Latest package has not passed both render checks.'
}
$windows=[IO.Path]::GetFullPath([string]$latest.path)
$prefix=$root+[IO.Path]::DirectorySeparatorChar
if (!$windows.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase) -or
    (Split-Path -Leaf $windows) -ne 'Windows') { throw 'Latest package path is outside the retained package directory.' }
$infoPath=Join-Path $windows 'BUILD_INFO.json'
$launcher=Join-Path $windows 'PLAY_VEILPOINT.cmd'
$game=Join-Path $windows 'Veilpoint/Binaries/Win64/Veilpoint.exe'
foreach ($file in @($infoPath,$launcher,$game)) {
    if (!(Test-Path -LiteralPath $file -PathType Leaf)) { throw "Verified package is incomplete: $file" }
}
$info=Get-Content -LiteralPath $infoPath -Raw | ConvertFrom-Json
if ($info.schema -ne 'veilpoint-packaged-build-v1' -or $info.sourceSha -cne $latest.sourceSha) {
    throw 'Latest pointer and packaged source version do not match.'
}
Write-Host "VEILPOINT verified build: $($latest.sourceSha)"
Write-Host $windows
if (!$InspectOnly) { & $launcher }
