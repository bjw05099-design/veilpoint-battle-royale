[CmdletBinding()]
param(
 [string]$EngineRoot='C:\Program Files\Epic Games\UE_5.8',
 [string]$ControllerRepository='bjw05099-design/veilpoint-build-pc'
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
if ($env:OS -ne 'Windows_NT') { throw 'Run this on the Windows PC that will build the game.' }
if ($ControllerRepository -cnotmatch '^bjw05099-design/[A-Za-z0-9_.-]+$') { throw 'The build controller must belong to the VEILPOINT owner.' }
if ($ControllerRepository -eq 'bjw05099-design/veilpoint-battle-royale') { throw 'Never register this personal PC in the public game repository.' }
$repo=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$toolRoot=Join-Path $repo '.tools'
& gh auth status
if ($LASTEXITCODE -ne 0) { throw 'Run gh auth login --scopes repo,workflow on THIS PC, then retry. Do not paste access tokens into chat.' }
$login=& gh api user --jq .login
if ($LASTEXITCODE -ne 0 -or $login -cne 'bjw05099-design') { throw 'Sign into the GitHub account that owns VEILPOINT.' }
& (Join-Path $PSScriptRoot 'prepare-native-ch01-win64.ps1') -EngineRoot $EngineRoot -PreflightOnly
$infoText=& gh repo view $ControllerRepository --json nameWithOwner,isPrivate 2>$null
if ($LASTEXITCODE -ne 0) {
    & gh repo create $ControllerRepository --private --description 'Private, owner-operated VEILPOINT Windows build controller'
    if ($LASTEXITCODE -ne 0) { throw 'Could not create the private build controller.' }
    $infoText=& gh repo view $ControllerRepository --json nameWithOwner,isPrivate
    if ($LASTEXITCODE -ne 0) { throw 'Cannot verify controller visibility.' }
}
$info=$infoText | ConvertFrom-Json
if (!$info.isPrivate -or $info.nameWithOwner -cne $ControllerRepository) { throw 'The controller must be the expected PRIVATE repository.' }
$pathsFile=Join-Path $toolRoot 'paths.json'
if (Test-Path $pathsFile) {
    $existing=Get-Content $pathsFile -Raw | ConvertFrom-Json
    if ($existing.PSObject.Properties['runner']) {
        $existingRoot=Split-Path (Split-Path $existing.runner -Parent) -Parent
        if (Test-Path (Join-Path $existingRoot '.runner')) { throw 'A runner is already configured. Use START_BUILD_PC.cmd, or remove its registration in GitHub before reconnecting.' }
    }
}
& py -3.13 (Join-Path $PSScriptRoot 'install-game-tools.py') --tools runner --tool-root $toolRoot
if ($LASTEXITCODE -ne 0) { throw 'Verified runner download failed.' }
$paths=Get-Content $pathsFile -Raw | ConvertFrom-Json
$runner=Split-Path (Split-Path $paths.runner -Parent) -Parent
# Retry partial setup only when an existing file is byte-identical.
function Put-NewControllerFile([string]$Path,[string]$Content) {
    $old=& gh api "repos/$ControllerRepository/contents/$Path" 2>$null
    if ($LASTEXITCODE -eq 0) {
        $file=$old | ConvertFrom-Json
        $decoded=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($file.content))
        if ($decoded -ceq $Content) { Write-Host "Already prepared: $Path"; return }
        if ($Path -eq 'build-request.json') {
            $requestBefore=$decoded | ConvertFrom-Json
            if ($requestBefore.schema -eq 'veilpoint-pc-build-v1' -and $requestBefore.operation -eq 'preflight' -and $requestBefore.source_sha -cmatch '^[0-9a-f]{40}$') { Write-Host 'Keeping the existing preflight request.'; return }
        }
        throw "Controller file differs: $Path. Review it instead of overwriting it."
    }
    $payload=@{message="Set up VEILPOINT $Path";branch='main';content=[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($Content))} | ConvertTo-Json
    $temporary=Join-Path $toolRoot ('controller-'+[Guid]::NewGuid().ToString('N')+'.json')
    try {
        [IO.File]::WriteAllText($temporary,$payload,[Text.UTF8Encoding]::new($false))
        & gh api --method PUT "repos/$ControllerRepository/contents/$Path" --input $temporary --silent
        if ($LASTEXITCODE -ne 0) { throw "Cannot create $Path in the private controller." }
    } finally { if (Test-Path $temporary) { Remove-Item -LiteralPath $temporary } }
}
$workflow=Get-Content -LiteralPath (Join-Path $repo 'tools/game-dev/private-controller/native.yml') -Raw
Put-NewControllerFile '.github/workflows/native.yml' $workflow
& git -C $repo fetch origin main
if ($LASTEXITCODE -ne 0) { throw 'Cannot read the current game main commit.' }
$sha=(& git -C $repo rev-parse origin/main).Trim()
if ($sha -cnotmatch '^[0-9a-f]{40}$') { throw 'Invalid source commit.' }
$request=@{schema='veilpoint-pc-build-v1';source_sha=$sha;operation='preflight'} | ConvertTo-Json
Put-NewControllerFile 'build-request.json' $request
$token=& gh api --method POST "repos/$ControllerRepository/actions/runners/registration-token" --jq .token
if ($LASTEXITCODE -ne 0 -or !$token) { throw 'Could not obtain a local, short-lived runner registration token.' }
Push-Location $runner
try {
    & .\config.cmd --unattended --url "https://github.com/$ControllerRepository" --token $token --name ('veilpoint-'+[Guid]::NewGuid().ToString('N').Substring(0,8)) --labels veilpoint-ue58 --work _work
    if ($LASTEXITCODE -ne 0) { throw 'Private build worker registration failed.' }
} finally { $token=$null; Pop-Location }
[Environment]::SetEnvironmentVariable('VEILPOINT_TOOL_ROOT',$toolRoot,'User')
[Environment]::SetEnvironmentVariable('VEILPOINT_UE_ROOT',[IO.Path]::GetFullPath($EngineRoot),'User')
Write-Host 'Private build worker registered. No background service was installed.'
Write-Host 'Allow the ChatGPT GitHub connection to access the new private controller repository, then run START_BUILD_PC.cmd.'
Write-Host 'The first queued job only checks prerequisites. Native builds require a later compile or author-package request.'
