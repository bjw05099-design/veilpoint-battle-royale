[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$ArchiveDirectory,
      [Parameter(Mandatory=$true)][string]$EvidenceDirectory)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$archive=[IO.Path]::GetFullPath($ArchiveDirectory)
$evidence=[IO.Path]::GetFullPath($EvidenceDirectory)
$game=Join-Path $archive 'Windows/Veilpoint/Binaries/Win64/Veilpoint.exe'
if (!(Test-Path -LiteralPath $game -PathType Leaf)) { throw 'Missing packaged Unreal executable.' }
New-Item -ItemType Directory -Path $evidence -Force | Out-Null

function Invoke-BRVerification([string]$Case, [switch]$Departure, [switch]$Rejoin) {
    $hostLog=Join-Path $evidence ($Case+'-host.log')
    $joinLog=Join-Path $evidence ($Case+'-client.log')
    $firstLog=Join-Path $evidence ($Case+'-first-client.log')
    if ((Test-Path -LiteralPath $hostLog) -or (Test-Path -LiteralPath $joinLog) -or
        ($Rejoin -and (Test-Path -LiteralPath $firstLog))) { throw 'Refusing stale BR lobby evidence.' }
    $modeOption=if ($Departure) { '-VPBRDepart' } elseif ($Rejoin) { '-VPBRRejoin' } else { '' }
    $endpoint=New-Object Net.IPEndPoint ([Net.IPAddress]::Loopback),0
    $temporary=New-Object Net.Sockets.UdpClient $endpoint
    try { $port=$temporary.Client.LocalEndPoint.Port } finally { $temporary.Dispose() }
    $processes=New-Object 'System.Collections.Generic.List[System.Diagnostics.Process]'
    function Start-BRVerification([string]$launch, [string]$log, [string]$extra='') {
        $config=New-Object Diagnostics.ProcessStartInfo
        $config.FileName=$game
        $config.WorkingDirectory=Split-Path -Parent $game
        $config.Arguments="$launch -nullrhi -unattended -nosound -nosplash -VPBRVerify $modeOption $extra -abslog=`"$log`""
        $config.UseShellExecute=$false
        $child=New-Object Diagnostics.Process
        $child.StartInfo=$config
        if (!$child.Start()) { throw 'Could not start packaged BR diagnostic process.' }
        $processes.Add($child)
        return $child
    }

    function Wait-BRHostLog([string]$Pattern, [int]$TimeoutSeconds) {
        $deadline=[DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
        $ready=$false
        do {
            if ($server.HasExited) { throw 'BR listen server terminated while waiting for lobby evidence.' }
            if (Test-Path -LiteralPath $hostLog) {
                $ready=(Get-Content -LiteralPath $hostLog -Raw) -match $Pattern
            }
            if (!$ready) { Start-Sleep -Milliseconds 250 }
        } until ($ready -or [DateTime]::UtcNow -ge $deadline)
        if (!$ready) { throw "Timed out waiting for BR lobby evidence: $Pattern" }
    }

    try {
        $server=Start-BRVerification "/Game/Maps/BR_Development?listen -port=$port -MULTIHOME=127.0.0.1" $hostLog
        Wait-BRHostLog ('listening on port '+$port+'(?:\D|$)') 36
        if ($Rejoin) {
            $first=Start-BRVerification ("127.0.0.1:"+$port) $firstLog '-VPBRLeaveDuringCountdown'
            if (!$first.WaitForExit(48000) -or $first.ExitCode -ne 0) { throw 'The first BR client did not leave cleanly.' }
            $firstEvidence=Get-Content -LiteralPath $firstLog -Raw
            if ($firstEvidence -notmatch 'VPBR_REJOIN_FIRST_CLIENT_LEFT' -or
                $firstEvidence -notmatch 'VPBR_REJOIN_DUPLICATE_READY_OK') {
                throw 'Missing evidence that the first client left during the countdown.'
            }
            Wait-BRHostLog 'VPBR_REJOIN_HOST_CANCELLED' 25
        }
        $client=Start-BRVerification ("127.0.0.1:"+$port) $joinLog
        if (!$client.WaitForExit(55000) -or !$server.WaitForExit(12000)) { throw 'Local packaged BR test exceeded its deadline.' }
        if ($server.ExitCode -ne 0 -or $client.ExitCode -ne 0) { throw 'A packaged BR diagnostic process failed.' }
        $hostEvidence=Get-Content -LiteralPath $hostLog -Raw
        $clientEvidence=Get-Content -LiteralPath $joinLog -Raw
        if ($Rejoin) {
            if ($hostEvidence -notmatch 'VPBR_REJOIN_HOST_PASS' -or $hostEvidence -notmatch 'VPBR_REJOIN_FRESH_DEADLINE' -or
                $clientEvidence -notmatch 'VPBR_REJOIN_CLIENT_PASS' -or
                $clientEvidence -notmatch 'VPBR_REJOIN_UNREADY_CONFIRMED') {
                throw 'The rejoining client did not restart readiness and reach the next round.'
            }
            return
        }
        if ($hostEvidence -notmatch 'VPBR_COUNTDOWN_CANCELLED' -or $clientEvidence -notmatch 'VPBR_COUNTDOWN_CANCELLED') {
            throw 'Missing host/client countdown cancellation evidence.'
        }
        if ($Departure) {
            if ($hostEvidence -notmatch 'VPBR_DEPARTURE_PASS: one departure, one survivor, winner record finalized' -or
                $clientEvidence -notmatch 'VPBR_CLIENT_DEPARTED: leaving an active round' -or
                $hostEvidence -match 'VPBR_QA_ROUND_RESOLVED') {
                throw 'Missing actual host/client departure and round finalization evidence.'
            }
        } elseif ($hostEvidence -notmatch 'VPBR_HOST_PASS: authoritative place #2' -or
                  $clientEvidence -notmatch 'VPBR_CLIENT_PASS: owner-only place #1' -or
                  $clientEvidence -notmatch 'VPBR_LOADOUT_PASS: owner received AKM') {
            throw 'Missing actual host/client round or owner privacy evidence.'
        }
    } finally {
        foreach ($process in $processes) {
            if (!$process.HasExited) { $process.Kill(); $process.WaitForExit(5000) | Out-Null }
            $process.Dispose()
        }
    }
}

Invoke-BRVerification -Case br-local
Invoke-BRVerification -Case br-departure -Departure
Invoke-BRVerification -Case br-lobby-rejoin -Rejoin
Write-Host 'BR local network proof passed: placements, owner records, active-round departure, and countdown rejoin.'
