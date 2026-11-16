Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
$fixture=Join-Path ([IO.Path]::GetTempPath()) ('veilpoint latest '+[Guid]::NewGuid().ToString('N'))
$sha='0123456789abcdef0123456789abcdef01234567'
$windows=Join-Path $fixture 'build/Windows'
$binary=Join-Path $windows 'Veilpoint/Binaries/Win64/Veilpoint.exe'
$script=Join-Path $repo 'scripts/launch-latest-native.ps1'
. (Join-Path $repo 'scripts/invoke-native-diagnostic-process.ps1')
function Write-Pointer($Path=$windows,$Source=$sha,$Offscreen=$true,$Window=$true) {
    @{sourceSha=$Source;path=$Path;offscreenRenderVerified=$Offscreen;windowRenderVerified=$Window} |
        ConvertTo-Json | Set-Content -LiteralPath (Join-Path $fixture 'latest-verified.json') -Encoding UTF8
}
function Expect-Rejected([string]$Label) {
    $rejected=$false
    try { & $script -PackageRoot $fixture -InspectOnly | Out-Null } catch { $rejected=$true }
    if (!$rejected) { throw "Launcher accepted invalid fixture: $Label" }
}
try {
    New-Item -ItemType Directory -Path (Split-Path -Parent $binary) -Force | Out-Null
    [IO.File]::WriteAllText($binary,'Fixture only, never launched')
    [IO.File]::WriteAllText((Join-Path $windows 'PLAY_VEILPOINT.cmd'),'Fixture only, never launched')
    @{schema='veilpoint-packaged-build-v1';sourceSha=$sha} | ConvertTo-Json |
        Set-Content -LiteralPath (Join-Path $windows 'BUILD_INFO.json') -Encoding UTF8
    Expect-Rejected 'missing pointer'
    Write-Pointer
    & $script -PackageRoot $fixture -InspectOnly | Out-Null
    # Reproduce the real user's entrypoint: a new Windows PowerShell process,
    # no PackageRoot argument, and a current directory unrelated to the game.
    Copy-Item -LiteralPath $script -Destination (Join-Path $fixture 'launch-latest-native.ps1')
    Copy-Item -LiteralPath (Join-Path $repo 'tools/game-dev/PLAY_LATEST_VEILPOINT.cmd') -Destination $fixture
    $powerShell=Join-Path $PSHOME 'powershell.exe'
    Push-Location $env:SystemRoot
    try {
        & $powerShell -NoProfile -ExecutionPolicy RemoteSigned -File (Join-Path $fixture 'launch-latest-native.ps1') -InspectOnly | Out-Null
        if ($LASTEXITCODE -ne 0) { throw 'Default root failed in a separate powershell.exe -File process.' }
        # Execute only our harmless batch fixture, never the dummy game binary.
        [IO.File]::WriteAllText((Join-Path $windows 'PLAY_VEILPOINT.cmd'), '@echo off'+[Environment]::NewLine+'echo fixture launched>"%~dp0fixture-launched.txt"')
        $batchCode=Invoke-NativeDiagnosticProcess -FilePath $env:ComSpec -Arguments ('/d /c ""'+(Join-Path $fixture 'PLAY_LATEST_VEILPOINT.cmd')+'" <nul"') -WorkingDirectory $env:SystemRoot -StdoutPath (Join-Path $fixture 'batch-stdout.txt') -StderrPath (Join-Path $fixture 'batch-stderr.txt') -TimeoutMilliseconds 10000
        if ($batchCode -ne 0 -or !(Test-Path -LiteralPath (Join-Path $windows 'fixture-launched.txt'))) {
            throw 'The real latest-build batch entrypoint did not reach the harmless fixture launcher.'
        }
    } finally { Pop-Location }
    Write-Pointer -Offscreen $false
    Expect-Rejected 'offscreen not verified'
    Write-Pointer -Window $false
    Expect-Rejected 'window not verified'
    Write-Pointer -Source 'not-a-source-hash'
    Expect-Rejected 'malformed source'
    Write-Pointer -Source ('a'*40)
    Expect-Rejected 'package source mismatch'
    Write-Pointer -Path ($fixture+'-other/Windows')
    Expect-Rejected 'directory-prefix sibling'
    Write-Pointer
    Remove-Item -LiteralPath $binary
    Expect-Rejected 'missing actual binary'
    Write-Host 'Latest native launcher validation passed; no game fixture was executed.'
} finally {
    if(Test-Path -LiteralPath $fixture) { Remove-Item -LiteralPath $fixture -Recurse -Force }
}
