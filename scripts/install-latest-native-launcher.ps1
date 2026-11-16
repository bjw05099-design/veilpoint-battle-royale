[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$PackageRoot)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath($PackageRoot)
$pointer=Join-Path $root 'latest-verified.json'
if (!(Test-Path -LiteralPath $pointer -PathType Leaf)) { throw 'No verified package pointer exists for launcher repair.' }
# Validate the existing package before installing only the two known helpers.
& (Join-Path $PSScriptRoot 'launch-latest-native.ps1') -PackageRoot $root -InspectOnly
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'launch-latest-native.ps1') -Destination $root -Force
Copy-Item -LiteralPath (Join-Path $PSScriptRoot '../tools/game-dev/PLAY_LATEST_VEILPOINT.cmd') -Destination $root -Force
$powerShell=Join-Path $PSHOME 'powershell.exe'
& $powerShell -NoProfile -ExecutionPolicy RemoteSigned -File (Join-Path $root 'launch-latest-native.ps1') -InspectOnly
if ($LASTEXITCODE -ne 0) { throw 'Installed launcher failed its default-directory check in a fresh PowerShell process.' }
Write-Host '[VEILPOINT] Existing verified game preserved; latest-build launcher repaired and checked.'
