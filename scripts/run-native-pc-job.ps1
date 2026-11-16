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
$report=[ordered]@{schema='veilpoint-native-pc-job-v1';operation=$Operation;sourceSha=(git -C $repo rev-parse HEAD);status='FAILED';nativeRuntimeVerified=$false;offscreenRenderVerified=$false;windowRenderVerified=$false;humanInputVerified=$false;gpuPerformanceVerified=$false}
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
        try {
            & (Join-Path $PSScriptRoot 'test-native-visual-smoke.ps1') -ArchiveDirectory (Join-Path $repo 'dist/native-win64') -EvidenceDirectory $logs
            $report.status='PACKAGED_OFFSCREEN_SMOKE_PASSED'
            $report.offscreenRenderVerified=$true
            & (Join-Path $PSScriptRoot 'test-native-visual-smoke.ps1') -ArchiveDirectory (Join-Path $repo 'dist/native-win64') -EvidenceDirectory $logs -Windowed
            $report.windowRenderVerified=$true
            $report.status='PACKAGED_WINDOW_SMOKE_PASSED'
            $report.humanInputVerified=$false
            $report.gpuPerformanceVerified=$false
            # The next runner checkout cleans source/dist. Retain verified
            # packages outside that workspace without touching Desktop copies.
            if (![string]::IsNullOrWhiteSpace($env:VEILPOINT_TOOL_ROOT)) {
                $retainedRoot=Join-Path ([IO.Path]::GetFullPath($env:VEILPOINT_TOOL_ROOT)) 'native-packages'
                $name=$report.sourceSha.Substring(0,12)+'-'+[DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss')
                $retained=Join-Path $retainedRoot $name
                if (Test-Path -LiteralPath $retained) { throw 'Retained package target already exists.' }
                New-Item -ItemType Directory -Path $retained -Force | Out-Null
                Copy-Item -LiteralPath (Join-Path $repo 'dist/native-win64/Windows') -Destination (Join-Path $retained 'Windows') -Recurse
                Copy-Item -LiteralPath (Join-Path $repo 'dist/native-win64/veilpoint-win64-manifest.json') -Destination $retained
                $report.retainedPackagePath=Join-Path $retained 'Windows'
                [ordered]@{sourceSha=$report.sourceSha;path=$report.retainedPackagePath;offscreenRenderVerified=$true;humanInputVerified=$false} |
                    ConvertTo-Json | Set-Content -LiteralPath (Join-Path $retainedRoot 'latest-verified.json') -Encoding UTF8
            }
        } catch {
            $report.status=if ($report.windowRenderVerified) { 'PACKAGED_RETENTION_FAILED' } elseif ($report.offscreenRenderVerified) { 'PACKAGED_WINDOW_SMOKE_FAILED' } else { 'PACKAGED_VISUAL_SMOKE_FAILED' }
            throw
        }
    } else { $report.status='PREFLIGHT_ONLY_NO_BUILD' }
} finally {
    $report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $reportDir 'native-job.json') -Encoding UTF8
}
