[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$ArchiveDirectory,
      [Parameter(Mandatory=$true)][string]$EvidenceDirectory)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'invoke-native-diagnostic-process.ps1')
$game=Join-Path ([IO.Path]::GetFullPath($ArchiveDirectory)) 'Windows/Veilpoint/Binaries/Win64/Veilpoint.exe'
$evidence=[IO.Path]::GetFullPath($EvidenceDirectory)
$captures=Join-Path ([IO.Path]::GetFullPath($ArchiveDirectory)) 'Windows/Veilpoint/Saved/Automation/AdenSmoke'
if (Test-Path -LiteralPath $captures) { throw 'Old Aden screenshot evidence is present.' }
if (!(Test-Path -LiteralPath $game -PathType Leaf)) { throw 'Packaged Unreal executable missing.' }
New-Item -ItemType Directory -Path $evidence -Force | Out-Null
$log=Join-Path $evidence 'aden-native-smoke-runtime.log'
if (Test-Path -LiteralPath $log) { throw 'Old Aden runtime evidence is present.' }
# No map argument: verify that the packaged default map actually is the native Aden story.
$arguments=@('-stdout','-FullStdOutLogOutput','-unattended','-nosound','-windowed','-ResX=1280','-ResY=720',
    '-RenderOffscreen','-VPAdenSmoke',('-abslog="'+$log+'"'))
try {
    $code=Invoke-NativeDiagnosticProcess -FilePath $game -WorkingDirectory (Split-Path -Parent $game) -TimeoutMilliseconds 150000 -Arguments ($arguments -join ' ') -StdoutPath (Join-Path $evidence 'aden-smoke-stdout.txt') -StderrPath (Join-Path $evidence 'aden-smoke-stderr.txt')
} finally {
    if (Test-Path -LiteralPath $captures -PathType Container) {
        Copy-Item -LiteralPath $captures -Destination $evidence -Recurse
    }
}
if ($code -ne 0 -or !(Test-Path -LiteralPath $log -PathType Leaf)) { throw 'Packaged Aden runtime did not finish.' }
$content=Get-Content -LiteralPath $log -Raw
if ($content -notmatch 'Aden native source loaded: 49 tiles, 183 roads, 4865 footprints' -or
    $content -notmatch 'ADEN_NATIVE_SMOKE_PASSED' -or
    $content -match 'ADEN_NATIVE_SMOKE_FAILED|Ensure condition failed|Fatal error:|Unhandled Exception:') {
    throw 'Packaged Aden collision, progression or SaveGame validation failed.'
}
$report=Get-Content -LiteralPath (Join-Path $captures 'visual-smoke.json') -Raw | ConvertFrom-Json
if ($report.schema -ne 'veilpoint-native-aden-visual-v1' -or $report.allStationsVerified -ne $true -or
    $report.confirmed -ne 3 -or $report.relaySlipSaved -ne $true -or $report.debriefSaved -ne $true -or
    $report.dispatchPhase -ne 5 -or $report.witnessCompleted -ne $true -or $report.noticeCompleted -ne $true) {
    throw 'Aden captured an incomplete native story.'
}
foreach ($name in @('aden-world','aden-field-map','aden-regional-map','aden-debrief','aden-dispatch-route','aden-dispatch-complete')) {
    $frame=$report.$name
    $png=Join-Path $captures ($name+'.png')
    if ($frame.map -notmatch 'CH01_Aden$' -or $frame.width -lt 1000 -or $frame.height -lt 600 -or
        !(Test-Path -LiteralPath $png -PathType Leaf) -or (Get-Item -LiteralPath $png).Length -lt 16000) {
        throw "Missing or incomplete packaged Aden render: $name"
    }
}
foreach ($name in @('aden-world','aden-debrief')) {
    if ($report.$name.warmGroundFraction -lt .22) {
        throw "Packaged Aden $name did not render enough visible terrain below the horizon."
    }
}
Write-Host '[VEILPOINT] Packaged native Aden route, observations, both atlas views, story and SaveGame passed.'
