[CmdletBinding()]
param()
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
if ($env:OS -ne 'Windows_NT') { throw 'A connected Windows build PC is required.' }
# A newly opened CMD can still inherit the launching shell's old environment.
# Read the values persisted by CONNECT_BUILD_PC into this runner process.
foreach ($key in @('VEILPOINT_TOOL_ROOT','VEILPOINT_UE_ROOT')) {
    $saved=[Environment]::GetEnvironmentVariable($key,'User')
    if ($saved) { [Environment]::SetEnvironmentVariable($key,$saved,'Process') }
}
if (!$env:VEILPOINT_UE_ROOT) { throw 'No engine path is configured. Run CONNECT_BUILD_PC.cmd first.' }
$root=$env:VEILPOINT_TOOL_ROOT
if (!$root) { $root=Join-Path $PSScriptRoot '../.tools' }
$paths=Get-Content -LiteralPath (Join-Path $root 'paths.json') -Raw | ConvertFrom-Json
if (!$paths.PSObject.Properties['runner']) { throw 'Run CONNECT_BUILD_PC.cmd first.' }
$runner=Split-Path (Split-Path $paths.runner -Parent) -Parent
if (!(Test-Path -LiteralPath (Join-Path $runner '.runner'))) { throw 'The private build runner has not been registered.' }
Write-Host 'Starting the private VEILPOINT build worker. Keep this window open; Ctrl+C stops it.'
Push-Location $runner
try { & .\run.cmd; if ($LASTEXITCODE -ne 0) { throw "Runner exited with $LASTEXITCODE" } }
finally { Pop-Location }
