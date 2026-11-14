[CmdletBinding()]
param([switch]$Install, [switch]$SkipBuildTools)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
if ($env:OS -ne 'Windows_NT') { throw 'Run this setup on the Windows development PC.' }
$repo=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$packages=@('Git.Git','GitHub.cli','OpenJS.NodeJS.LTS','Python.Python.3.13','Gyan.FFmpeg','BaldurKarlsson.RenderDoc','EpicGames.EpicGamesLauncher')
Write-Host '[VEILPOINT] Portable Blender 5.2.4 LTS + agent-desktop 1.3.1; Git, Python, Node, CMake, Ninja, FFmpeg, GitHub CLI.'
Write-Host '[VEILPOINT] Unreal Engine 5.8 must be installed through your Epic account on this PC.'
if (!$Install) {
    Write-Host 'Plan only. Run SETUP_GAME_DEV.cmd to install. No system setting was changed.'
    return
}
if (!(Get-Command winget -ErrorAction SilentlyContinue)) { throw 'Install/update Microsoft App Installer (winget), then run setup again.' }
function Refresh-ProcessPath {
    $env:Path=[Environment]::GetEnvironmentVariable('Path','Machine')+';'+[Environment]::GetEnvironmentVariable('Path','User')
}
foreach ($id in $packages) {
    & winget list --id $id --exact --accept-source-agreements --disable-interactivity *> $null
    if ($LASTEXITCODE -eq 0) { Write-Host "Already installed: $id"; continue }
    & winget install --id $id --exact --source winget --accept-source-agreements --accept-package-agreements --silent --disable-interactivity
    if ($LASTEXITCODE -ne 0) { throw "winget failed for $id (exit $LASTEXITCODE); inspect the installer result and resume setup." }
}
Refresh-ProcessPath
if (!$SkipBuildTools) {
    $vsconfig=Join-Path $repo 'tools/game-dev/windows.vsconfig'
    & winget install --id Microsoft.VisualStudio.2022.BuildTools --exact --source winget --accept-source-agreements --accept-package-agreements --override "--wait --passive --norestart --config `"$vsconfig`""
    # A current existing VS installation may report no applicable upgrade.
    # Do not hide that case: report the required components for its installer.
    if ($LASTEXITCODE -ne 0) { Write-Warning "Visual Studio installer returned $LASTEXITCODE. Import tools/game-dev/windows.vsconfig in Visual Studio Installer and verify VS 2022 17.14+ before a UE5.8 build." }
}
Refresh-ProcessPath
$toolRoot=Join-Path $repo '.tools'
Push-Location $repo
try {
    & py -3.13 scripts/install-game-tools.py --with-agent-source --tool-root $toolRoot
    if ($LASTEXITCODE -ne 0) { throw 'Portable tool installation failed.' }
    & py -3.13 scripts/install-game-tools.py --tools tracy --tool-root $toolRoot
    if ($LASTEXITCODE -ne 0) { throw 'Tracy installation failed.' }
    & py -3.13 -m venv (Join-Path $toolRoot 'asset-python')
    if ($LASTEXITCODE -ne 0) { throw 'Could not create the isolated asset Python environment.' }
    $assetPython=Join-Path $toolRoot 'asset-python/Scripts/python.exe'
    & $assetPython -m pip install --only-binary=:all: -r tools/game-dev/python-requirements.txt --report (Join-Path $toolRoot 'python-install-report.json')
    if ($LASTEXITCODE -ne 0) { throw 'Extended geometry/GIS/build tools did not install.' }
    & npm.cmd ci --prefix tools/game-dev --ignore-scripts --no-fund --no-audit
    if ($LASTEXITCODE -ne 0) { throw 'Locked asset tool installation failed.' }
    & git lfs install --local
    if ($LASTEXITCODE -ne 0) { throw 'Git LFS is missing or the checkout is not a git repository.' }
    & node scripts/game-dev-doctor.cjs --strict-assets --output dist/game-dev/windows-tool-report.json
    if ($LASTEXITCODE -ne 0) { throw 'A required asset tool did not execute.' }
    & node scripts/export-harbor-blender-recipe.cjs
    if ($LASTEXITCODE -ne 0) { throw 'Harbor source extraction failed.' }
    $paths=Get-Content (Join-Path $toolRoot 'paths.json') -Raw | ConvertFrom-Json
    & $paths.blender --background --factory-startup --threads 2 --python-exit-code 1 --python scripts/blender-build-harbor.py -- dist/game-assets/harbor/recipe.json dist/game-assets/harbor
    if ($LASTEXITCODE -ne 0) { throw 'Blender export failed.' }
    & node tools/game-dev/process-harbor.mjs
    if ($LASTEXITCODE -ne 0) { throw 'GLB validation/optimization failed.' }
    & $assetPython tools/game-dev/smoke-python-tools.py
    if ($LASTEXITCODE -ne 0) { throw 'Extended geometry/GIS tool checks failed.' }
} finally { Pop-Location }
[Environment]::SetEnvironmentVariable('VEILPOINT_TOOL_ROOT',$toolRoot,'User')
$env:VEILPOINT_TOOL_ROOT=$toolRoot
Write-Host 'Tool installation verified ON THIS PC. No remote session or Unreal build is claimed.'
Write-Host "Local MCP configuration (for a local MCP-capable agent): $toolRoot\mcp.agent-desktop.json"
Write-Host 'Next: install Unreal 5.8 in Epic Games Launcher, then CONNECT_BUILD_PC.cmd.'
