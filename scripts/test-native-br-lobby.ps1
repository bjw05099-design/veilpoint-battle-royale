[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$ArchiveDirectory,
      [Parameter(Mandatory=$true)][string]$EvidenceDirectory)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$archive=[IO.Path]::GetFullPath($ArchiveDirectory)
$evidence=[IO.Path]::GetFullPath($EvidenceDirectory)
$game=Join-Path $archive 'Windows/Veilpoint/Binaries/Win64/Veilpoint.exe'
$hostLog=Join-Path $evidence 'br-local-host.log'
$joinLog=Join-Path $evidence 'br-local-client.log'
if (!(Test-Path -LiteralPath $game -PathType Leaf)) { throw 'Missing packaged Unreal executable.' }
if ((Test-Path -LiteralPath $hostLog) -or (Test-Path -LiteralPath $joinLog)) { throw 'Refusing stale BR lobby evidence.' }
New-Item -ItemType Directory -Path $evidence -Force | Out-Null

$endpoint=New-Object Net.IPEndPoint ([Net.IPAddress]::Loopback),0
$temporary=New-Object Net.Sockets.UdpClient $endpoint
try { $port=$temporary.Client.LocalEndPoint.Port } finally { $temporary.Dispose() }
$processes=New-Object 'System.Collections.Generic.List[System.Diagnostics.Process]'
function Start-BRVerification([string]$launch, [string]$log) {
    $config=New-Object Diagnostics.ProcessStartInfo
    $config.FileName=$game
    $config.WorkingDirectory=Split-Path -Parent $game
    $config.Arguments="$launch -nullrhi -unattended -nosound -nosplash -VPBRVerify -abslog=`"$log`""
    $config.UseShellExecute=$false
    $child=New-Object Diagnostics.Process
    $child.StartInfo=$config
    if (!$child.Start()) { throw 'Could not start packaged BR diagnostic process.' }
    $processes.Add($child)
    return $child
}

try {
    $server=Start-BRVerification "/Game/Maps/BR_Development?listen -port=$port -MULTIHOME=127.0.0.1" $hostLog
    $deadline=[DateTime]::UtcNow.AddSeconds(36)
    $ready=$false
    do {
        if ($server.HasExited) { throw 'BR listen server terminated during startup.' }
        if (Test-Path -LiteralPath $hostLog) {
            $ready=(Get-Content -LiteralPath $hostLog -Raw) -match ('listening on port '+$port+'(?:\D|$)')
        }
        if (!$ready) { Start-Sleep -Milliseconds 250 }
    } until ($ready -or [DateTime]::UtcNow -ge $deadline)
    if (!$ready) { throw 'BR listen server never bound its loopback port.' }
    $client=Start-BRVerification ("127.0.0.1:"+$port) $joinLog
    if (!$client.WaitForExit(55000) -or !$server.WaitForExit(12000)) { throw 'Local packaged BR test exceeded its deadline.' }
    if ($server.ExitCode -ne 0 -or $client.ExitCode -ne 0) { throw 'A packaged BR diagnostic process failed.' }
    $hostEvidence=Get-Content -LiteralPath $hostLog -Raw
    $clientEvidence=Get-Content -LiteralPath $joinLog -Raw
    if ($hostEvidence -notmatch 'VPBR_HOST_PASS' -or $clientEvidence -notmatch 'VPBR_CLIENT_PASS' -or
        $hostEvidence -notmatch 'VPBR_COUNTDOWN_CANCELLED' -or $clientEvidence -notmatch 'VPBR_COUNTDOWN_CANCELLED') {
        throw 'Missing actual host/client countdown cancellation, round or owner privacy evidence.'
    }
    Write-Host 'BR local network proof passed: both processes observed cancellation and finished the restarted countdown and round.'
} finally {
    foreach ($process in $processes) {
        if (!$process.HasExited) { $process.Kill(); $process.WaitForExit(5000) | Out-Null }
        $process.Dispose()
    }
}
