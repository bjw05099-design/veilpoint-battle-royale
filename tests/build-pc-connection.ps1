# Exercise native stderr under Windows PowerShell 5.1 without GitHub writes,
# account changes, runner registration or an installed Unreal engine.
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$repo=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
. (Join-Path $repo 'scripts/build-pc-helpers.ps1')
$temporary=Join-Path ([IO.Path]::GetTempPath()) ('veilpoint-connect-test-'+[Guid]::NewGuid().ToString('N'))
$savedPath=$env:Path
$keys=@('VEILPOINT_GH_FIXTURE_STDOUT','VEILPOINT_GH_FIXTURE_STDERR','VEILPOINT_GH_FIXTURE_EXIT_CODE','VEILPOINT_GH_FIXTURE_CALLS')
$saved=@{}
foreach ($key in $keys) { $saved[$key]=[Environment]::GetEnvironmentVariable($key,'Process') }
try {
    New-Item -ItemType Directory -Path $temporary | Out-Null
    $env:VEILPOINT_GH_FIXTURE_STDOUT=Join-Path $temporary 'stdout.txt'
    $env:VEILPOINT_GH_FIXTURE_STDERR=Join-Path $temporary 'stderr.txt'
    $env:VEILPOINT_GH_FIXTURE_CALLS=Join-Path $temporary 'calls.txt'
    $native=@'
using System;
using System.IO;
public static class VeilpointGitHubReadFixture {
    public static int Main(string[] args) {
        File.AppendAllText(Environment.GetEnvironmentVariable("VEILPOINT_GH_FIXTURE_CALLS"), String.Join(" ", args) + Environment.NewLine);
        Console.Out.Write(File.ReadAllText(Environment.GetEnvironmentVariable("VEILPOINT_GH_FIXTURE_STDOUT")));
        Console.Error.Write(File.ReadAllText(Environment.GetEnvironmentVariable("VEILPOINT_GH_FIXTURE_STDERR")));
        return Int32.Parse(Environment.GetEnvironmentVariable("VEILPOINT_GH_FIXTURE_EXIT_CODE"));
    }
}
'@
    # Use a real native executable: Windows can prefer an installed gh.exe
    # over a gh.cmd shim even when the shim directory appears first in PATH.
    Add-Type -TypeDefinition $native -Language CSharp -OutputAssembly (Join-Path $temporary 'gh.exe') -OutputType ConsoleApplication
    $env:Path=$temporary+';'+$savedPath
    if ((Get-Command gh -CommandType Application | Select-Object -First 1).Source -ne (Join-Path $temporary 'gh.exe')) { throw 'Fixture must not use the real GitHub CLI.' }
    function Set-GhFixture([string]$Output,[string]$ErrorText,[int]$ExitCode) {
        [IO.File]::WriteAllText($env:VEILPOINT_GH_FIXTURE_STDOUT,$Output,[Text.Encoding]::ASCII)
        [IO.File]::WriteAllText($env:VEILPOINT_GH_FIXTURE_STDERR,$ErrorText,[Text.Encoding]::ASCII)
        $env:VEILPOINT_GH_FIXTURE_EXIT_CODE=[string]$ExitCode
    }
    foreach ($endpoint in @('repos/owner/controller','repos/owner/controller/contents/.github/workflows/native.yml')) {
        Set-GhFixture "HTTP/2.0 404 Not Found`r`nContent-Type: application/json`r`n`r`n{`"message`":`"Not Found`"}" 'gh: Not Found (HTTP 404)' 1
        $result=Get-BuildPcGitHubResource -Endpoint $endpoint
        if ($result.Found -or $null -ne $result.Data -or $ErrorActionPreference -ne 'Stop') { throw 'A missing repository/file must be recoverable without weakening caller error handling.' }
    }
    Set-GhFixture "HTTP/2.0 200 OK`r`nContent-Type: application/json`r`n`r`n{`"full_name`":`"owner/controller`",`"private`":true}" '' 0
    $result=Get-BuildPcGitHubResource -Endpoint 'repos/owner/controller'
    if (!$result.Found -or !$result.Data.private -or $result.Data.full_name -cne 'owner/controller') { throw 'Valid repository JSON was not preserved.' }
    foreach ($http in @(401,403,429,500)) {
        Set-GhFixture "HTTP/1.1 $http Error`r`nContent-Type: application/json`r`n`r`n{`"message`":`"failed`"}" "gh: request failed (HTTP $http)" 1
        $rejected=$false
        try { Get-BuildPcGitHubResource -Endpoint 'repos/owner/controller' | Out-Null }
        catch { $rejected=$_.Exception.Message -like "*HTTP $http*" }
        if (!$rejected -or $ErrorActionPreference -ne 'Stop') { throw "HTTP $http must not be interpreted as an absent repository." }
    }
    Set-GhFixture '' 'dial tcp: no such host' 1
    $rejected=$false
    try { Get-BuildPcGitHubResource -Endpoint 'repos/owner/controller' | Out-Null }
    catch { $rejected=$_.Exception.Message -like '*no valid HTTP response*' }
    if (!$rejected -or $ErrorActionPreference -ne 'Stop') { throw 'A network failure must not permit creation.' }
    Set-GhFixture "HTTP/2.0 200 OK`r`nContent-Type: application/json`r`n`r`nnot-json" '' 0
    $rejected=$false
    try { Get-BuildPcGitHubResource -Endpoint 'repos/owner/controller' | Out-Null }
    catch { $rejected=$true }
    if (!$rejected) { throw 'Malformed JSON must fail closed.' }
    $missingDrive=[Guid]::NewGuid().ToString('N')+':\UE_5.8'
    $rejected=$false
    try { Resolve-BuildPcEngineRoot -EngineRoot $missingDrive | Out-Null }
    catch { $rejected=$_.Exception.Message -like '*actual UE_5.8 installation folder*' }
    if (!$rejected) { throw 'A nonexistent example drive needs an actionable engine-path error.' }
    $engine=Join-Path $temporary 'Epic Games\UE_5.8'
    New-Item -ItemType Directory -Path $engine -Force | Out-Null
    if ((Resolve-BuildPcEngineRoot -EngineRoot $engine) -cne $engine) { throw 'An actual engine directory with spaces must be preserved.' }
    $calls=Get-Content -LiteralPath $env:VEILPOINT_GH_FIXTURE_CALLS
    foreach ($call in $calls) {
        if ($call -notlike 'api --hostname github.com --include --method GET repos/*') { throw 'Connection probe tests must make only bounded read requests.' }
    }
    Write-Host 'PC connection regression checks PASS: native stderr/404, valid JSON, auth/rate/server/network failures and engine paths. No GitHub resources or PC runner were created.'
} finally {
    $env:Path=$savedPath
    foreach ($key in $keys) { [Environment]::SetEnvironmentVariable($key,$saved[$key],'Process') }
    if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary -Recurse -Force }
}
