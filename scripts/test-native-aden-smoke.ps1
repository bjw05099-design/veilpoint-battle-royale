[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$ArchiveDirectory,
      [Parameter(Mandatory=$true)][string]$EvidenceDirectory)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'invoke-native-diagnostic-process.ps1')
$game=Join-Path ([IO.Path]::GetFullPath($ArchiveDirectory)) 'Windows/Veilpoint/Binaries/Win64/Veilpoint.exe'
$evidence=[IO.Path]::GetFullPath($EvidenceDirectory)
if (!(Test-Path -LiteralPath $game -PathType Leaf)) { throw 'Packaged Unreal executable missing.' }
New-Item -ItemType Directory -Path $evidence -Force | Out-Null
$log=Join-Path $evidence 'aden-native-smoke-runtime.log'
if (Test-Path -LiteralPath $log) { throw 'Old Aden runtime evidence is present.' }
# No map argument: verify that the packaged default map actually is the native Aden story.
$arguments=@('-stdout','-FullStdOutLogOutput','-unattended','-nosound','-windowed','-ResX=1280','-ResY=720',
    '-RenderOffscreen','-VPAdenSmoke',('-abslog="'+$log+'"'))
$code=Invoke-NativeDiagnosticProcess -FilePath $game -WorkingDirectory (Split-Path -Parent $game) -TimeoutMilliseconds 150000 -Arguments ($arguments -join ' ') -StdoutPath (Join-Path $evidence 'aden-smoke-stdout.txt') -StderrPath (Join-Path $evidence 'aden-smoke-stderr.txt')
if ($code -ne 0 -or !(Test-Path -LiteralPath $log -PathType Leaf)) { throw 'Packaged Aden runtime did not finish.' }
$content=Get-Content -LiteralPath $log -Raw
if ($content -notmatch 'Aden native source loaded: 49 tiles, 183 roads, 4865 footprints' -or
    $content -notmatch 'ADEN_NATIVE_SMOKE_PASSED' -or
    $content -match 'ADEN_NATIVE_SMOKE_FAILED|Ensure condition failed|Fatal error:|Unhandled Exception:') {
    throw 'Packaged Aden collision, progression or SaveGame validation failed.'
}
Write-Host '[VEILPOINT] Packaged native Aden source, swept route, interaction and SaveGame passed.'
