# VEILPOINT independent CH01 WebView2 Win64 candidate, NOT native UE5.
# Must run AFTER package-windows-demo.ps1 on the same Windows build runner.
[CmdletBinding()]
param()
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
if ($env:OS -ne 'Windows_NT') { throw '[VEILPOINT] Story Win64 packaging requires Windows.' }
$repo=(Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$publish=Join-Path $repo 'dist/windows-exe-publish'
$storyZip=Join-Path $repo 'dist/story-first/veilpoint-story-preview.zip'
$out=Join-Path $repo 'dist/windows-story-exe'
$stage=Join-Path $repo 'dist/windows-story-exe-stage'
$probe=Join-Path $repo 'dist/windows-story-exe-extract-test'
foreach ($folder in @($out,$stage,$probe)) {
  if (Test-Path -LiteralPath $folder) { Remove-Item -LiteralPath $folder -Recurse -Force }
  New-Item -ItemType Directory -Path $folder -Force | Out-Null
}
Push-Location $repo
try {
  & npm run package:story-preview
  if ($LASTEXITCODE -ne 0) { throw 'Story-only source archive verification failed' }
  if (!(Test-Path -LiteralPath $storyZip -PathType Leaf)) { throw 'Verified story-only archive missing' }
  $exeSource=Join-Path $publish 'VEILPOINT.Demo.exe'
  if (!(Test-Path -LiteralPath $exeSource -PathType Leaf)) {
    throw 'Verified Win64 host binary missing; run package-windows-demo.ps1 first'
  }
  Copy-Item -Path (Join-Path $publish '*') -Destination $stage -Recurse -Force
  if (!(Get-ChildItem -LiteralPath $stage -Recurse -File -Filter 'WebView2Loader.dll' |
        Select-Object -First 1)) { throw 'Story EXE lacks WebView2Loader.dll' }
  $game=Join-Path $stage 'game'
  Expand-Archive -LiteralPath $storyZip -DestinationPath $game -Force
  foreach ($item in @('index.html','story.html','src/story-app.js',
                       'src/story-slice.js','NOTICE.txt','MANIFEST.sha256','QUICK_START.txt')) {
    if (!(Test-Path -LiteralPath (Join-Path $game $item) -PathType Leaf)) {
      throw "Missing story-only payload entry: $item"
    }
  }
  foreach ($forbidden in @('src/app.js','src/br96-client.js','terrain.html','br96.html','team.html')) {
    if (Test-Path -LiteralPath (Join-Path $game $forbidden)) {
      throw "Battle Royale or terrain entry leaked into story-only Windows archive: $forbidden"
    }
  }
  # Standalone Windows StoryOnly distribution automatically activates the
  # locked CH01 UI based on its BR-free, independently verified game manifest.
  $guide=@'
VEILPOINT STORY CH01 - WINDOWS EXE CANDIDATE

1. Extract the ENTIRE veilpoint-story-windows-exe.zip to a new folder.
2. Double-click VEILPOINT.Demo.exe. The BR-free package automatically opens
   the STORY-only CH01 WebView2 host, with no Battle Royale or terrain modes.
3. Preserve all included files and game/ folder next to the executable.
4. Windows 10/11 x64 needs the installed Microsoft Edge WebView2 runtime.
5. Existing browser/combined-host checkpoints are separate; story-only saves
   use %LOCALAPPDATA%\VEILPOINT\DemoHost\StoryOnly in this development build.

NOT UE5, NOT THE 12-HOUR CAMPAIGN, NOT SIGNED AND NOT PERFORMANCE-VALIDATED.
This is an OFFLINE Windows WebView2 desktop host over a limited CH01 prototype.
No real Aden-city coverage or RTX 3070/165FPS claim has been verified.
'@
  [IO.File]::WriteAllText((Join-Path $stage 'START_HERE.txt'),
    $guide,[Text.UTF8Encoding]::new($false))
  $exe=Join-Path $stage 'VEILPOINT.Demo.exe'
  $first=Start-Process -FilePath $exe -ArgumentList '--verify-package' -Wait -PassThru
  if ($first.ExitCode -ne 0) { throw 'Real Windows EXE rejected clean BR-free story payload' }
  $zip=Join-Path $out 'veilpoint-story-windows-exe.zip'
  Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $zip -CompressionLevel Optimal -Force
  $sha=(Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant()
  [IO.File]::WriteAllText((Join-Path $out 'veilpoint-story-windows-exe.zip.sha256'),
    "$sha  veilpoint-story-windows-exe.zip" + [Environment]::NewLine,
    [Text.UTF8Encoding]::new($false))
  Expand-Archive -LiteralPath $zip -DestinationPath $probe -Force
  foreach ($entry in @('VEILPOINT.Demo.exe','START_HERE.txt',
                        'game/story.html','game/src/story-app.js','game/MANIFEST.sha256')) {
    if (!(Test-Path -LiteralPath (Join-Path $probe $entry) -PathType Leaf)) {
      throw "Extracted story Win64 package incomplete: $entry"
    }
  }
  $after=(Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($after -cne $sha) { throw 'Story-only Win64 outer ZIP SHA-256 mismatch' }
  $probeExe=Join-Path $probe 'VEILPOINT.Demo.exe'
  $clean=Start-Process -FilePath $probeExe -ArgumentList '--verify-package' -Wait -PassThru
  if ($clean.ExitCode -ne 0) { throw 'Extracted story Win64 EXE did not pass preflight' }
  Add-Content -LiteralPath (Join-Path $probe 'game/src/story-app.js') -Value '// corrupted story proof'
  $tampered=Start-Process -FilePath $probeExe -ArgumentList '--verify-package' -Wait -PassThru
  if ($tampered.ExitCode -eq 0) { throw 'Story-only EXE accepted corrupted story JavaScript' }
  Copy-Item -LiteralPath (Join-Path $stage 'game/src/story-app.js') -Destination (Join-Path $probe 'game/src/story-app.js') -Force
  $restored=Start-Process -FilePath $probeExe -ArgumentList '--verify-package' -Wait -PassThru
  if ($restored.ExitCode -ne 0) { throw 'Story-only EXE rejected restored story script' }
  Write-Host '[VEILPOINT] Real story-only EXE preflight passed: clean=0, tampered=nonzero, restored=0.'
  Write-Host "[VEILPOINT] Independent story-only WebView2 ZIP verified: $zip"
  Write-Host "[VEILPOINT] SHA256: $sha"
  Write-Host '[VEILPOINT] No UE5 build, real device playback or GPU FPS test is claimed.'
}
finally { Pop-Location }
