[CmdletBinding()]
param(
 [Parameter(Mandatory=$true)][string]$EngineRoot,
 [ValidateSet('preflight','compile','author-package')][string]$Operation='preflight'
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
if ($env:OS -ne 'Windows_NT') { throw 'Native builds require the connected Windows PC.' }
$repo=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$engine=[IO.Path]::GetFullPath($EngineRoot)
$version=Get-Content -LiteralPath (Join-Path $engine 'Engine/Build/Build.version') -Raw | ConvertFrom-Json
if ($version.MajorVersion -ne 5 -or $version.MinorVersion -ne 8) { throw 'The project requires Unreal 5.8.' }
$build=Join-Path $engine 'Engine/Build/BatchFiles/Build.bat'
if (!(Test-Path -LiteralPath $build)) { throw 'Unreal Build.bat is missing.' }
$logs=Join-Path $repo 'dist/native-build-logs'
$reportDir=Join-Path $repo 'dist/game-dev'
New-Item -ItemType Directory -Force $logs,$reportDir | Out-Null
$report=[ordered]@{schema='veilpoint-native-pc-job-v1';operation=$Operation;sourceSha=(git -C $repo rev-parse HEAD);status='FAILED';nativeRuntimeVerified=$false}
try {
    & (Join-Path $PSScriptRoot 'prepare-native-ch01-win64.ps1') -EngineRoot $engine -PreflightOnly
    if ($Operation -eq 'compile') {
        $project=Join-Path $repo 'Unreal/Veilpoint/Veilpoint.uproject'
        $before=$ErrorActionPreference
        $ErrorActionPreference='Continue'
        try {
            & $build 'VeilpointEditor' 'Win64' 'Development' "-Project=$project" '-WaitMutex' '-NoHotReload' '-MaxParallelActions=2' 2>&1 | Tee-Object -FilePath (Join-Path $logs 'editor-compile.log')
            $code=$LASTEXITCODE
        } finally { $ErrorActionPreference=$before }
        if ($code -ne 0) { throw "Unreal C++ compile failed: $code" }
        $module=Join-Path $repo 'Unreal/Veilpoint/Binaries/Win64/UnrealEditor-Veilpoint.dll'
        if (!(Test-Path -LiteralPath $module -PathType Leaf) -or (Get-Item -LiteralPath $module).Length -lt 4096) { throw 'Build returned success without the native Veilpoint Editor module.' }
        $report.moduleSha256=(Get-FileHash -LiteralPath $module -Algorithm SHA256).Hash.ToLowerInvariant()
        $report.status='EDITOR_COMPILED_NOT_RUNTIME_TESTED'
    } elseif ($Operation -eq 'author-package') {
        & (Join-Path $PSScriptRoot 'prepare-native-ch01-win64.ps1') -EngineRoot $engine -PackageNative
        $report.status='PACKAGED_NOT_RUNTIME_TESTED'
    } else { $report.status='PREFLIGHT_ONLY_NO_BUILD' }
} finally {
    $report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $reportDir 'native-job.json') -Encoding UTF8
}
