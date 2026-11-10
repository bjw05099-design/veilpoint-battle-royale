# VEILPOINT offline Windows EXE host candidate (NOT the independent UE5 build).
# Requires Windows 10/11 x64 build runner, .NET SDK 10 and Node 22.
# Downloads WebView2 SDK/.NET publish dependencies ONLY at build time.
[CmdletBinding()]
param()
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
if ($env:OS -ne 'Windows_NT') { throw '[VEILPOINT] This packaging target requires Windows.' }
$repo=(Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$out=Join-Path $repo 'dist/windows-exe'
$publish=Join-Path $repo 'dist/windows-exe-publish'
$stage=Join-Path $repo 'dist/windows-exe-stage'
$probe=Join-Path $repo 'dist/windows-exe-extract-test'
$project=Join-Path $repo 'windows/VEILPOINT.DemoHost/VEILPOINT.DemoHost.csproj'
$demoZip=Join-Path $repo 'dist/veilpoint-offline-demo.zip'
if (!(Test-Path -LiteralPath $project -PathType Leaf)) { throw 'Windows host project missing' }
foreach ($folder in @($out,$publish,$stage,$probe)) {
  if (Test-Path -LiteralPath $folder) {
    Remove-Item -LiteralPath $folder -Recurse -Force
  }
  New-Item -ItemType Directory -Path $folder -Force | Out-Null
}
Push-Location $repo
try {
  # This step already creates and independently verifies the browser ZIP,
  # per-file checksum manifest, CRC32, safe paths and offline asset closure.
  & npm run package:demo
  if ($LASTEXITCODE -ne 0) { throw 'Original browser offline ZIP gate failed' }
  if (!(Test-Path -LiteralPath $demoZip -PathType Leaf)) {
    throw 'Verified browser ZIP missing'
  }
  & dotnet publish $project -c Release -r win-x64 --self-contained true -o $publish /p:PublishSingleFile=true /p:PublishTrimmed=false
  if ($LASTEXITCODE -ne 0) { throw 'Win64 demo host .NET publish failed' }

  # Retain every managed/native file emitted by publish. The .NET runtime is
  # self-contained, but WebView2Loader.dll and the Edge WebView2 Evergreen
  # runtime are DIFFERENT prerequisites; never report this as UE5-native.
  Copy-Item -Path (Join-Path $publish '*') -Destination $stage -Recurse -Force
  $exe=Join-Path $stage 'VEILPOINT.Demo.exe'
  if (!(Test-Path -LiteralPath $exe -PathType Leaf)) { throw 'Compiled Windows EXE missing' }
  $magic=[IO.File]::ReadAllBytes($exe)
  if ($magic.Length -lt 1024 -or $magic[0] -ne 0x4d -or $magic[1] -ne 0x5a) {
    throw 'Published file is not a Windows PE executable'
  }
  if (!(Get-ChildItem -LiteralPath $stage -Recurse -File -Filter 'WebView2Loader.dll' |
      Select-Object -First 1)) {
    throw 'WebView2Loader.dll missing from the published Windows host'
  }
  $game=Join-Path $stage 'game'
  Expand-Archive -LiteralPath $demoZip -DestinationPath $game -Force
  foreach ($required in @('index.html','story.html','src/app.js','src/story-app.js',
                         'MANIFEST.sha256','QUICK_START.txt','NOTICE.txt')) {
    if (!(Test-Path -LiteralPath (Join-Path $game $required) -PathType Leaf)) {
      throw "Bundled game asset missing: $required"
    }
  }

  $guide=@'
VEILPOINT WINDOWS OFFLINE EXE - CANDIDATE

1. Extract the ENTIRE veilpoint-windows-demo-exe.zip to a new directory.
2. Double-click VEILPOINT.Demo.exe. CH01 STORY opens FIRST. Keep the
   game/ folder and all companion files beside the EXE. BR and original
   terrain preview remain optional buttons for the combined developer demo.
   To block alternate mode navigation, launch .\VEILPOINT.Demo.exe --story-only
   from PowerShell. This reuses the same combined payload, not a UE5 build.
3. Requires Windows 10/11 x64 AND an installed Microsoft Edge WebView2
   Evergreen runtime. Windows 11 typically includes the runtime; if absent,
   install it from the official Microsoft source before launching the demo.
   The packaged .NET 10 runtime is self-contained. This ZIP does not silently
   download or install WebView2 and cannot run without that browser runtime.
4. Existing browser ZIP (veilpoint-offline-demo.zip) remains a separate way
   to run the same offline game in a full browser.
5. EXE-host checkpoints are stored per user in the host WebView2 profile
   under %LOCALAPPDATA%\VEILPOINT\DemoHost\WebView2. They do not auto-import
   earlier browser file:// saves. Keep this profile to retain BR and CH01 saves.

TRUST AND SCOPE
- This is a .NET WebView2 runtime wrapper around the offline BR + CH01 demo,
  NOT a compiled Unreal Engine 5 native build.
- The game host blocks external HTTP(S) resources and top-level external
  navigation. It uses bundled HTML/JavaScript only.
- Unsigned developer candidate: no publisher code signature, verified
  Windows hardware launch, measured 165 FPS, or independent Unreal build.
- A successful Windows GitHub Actions compile and ZIP-integrity check is
  NOT a user-PC game playthrough certificate.
- Do not disable operating-system protections to run an untrusted file.
- The final independent UE5 Windows .exe is a separate 2027 development goal.
'@
  [IO.File]::WriteAllText((Join-Path $stage 'START_HERE.txt'),
    $guide,[Text.UTF8Encoding]::new($false))
  $zip=Join-Path $out 'veilpoint-windows-demo-exe.zip'
  Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $zip -CompressionLevel Optimal -Force
  $sha=(Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant()
  [IO.File]::WriteAllText((Join-Path $out 'veilpoint-windows-demo-exe.zip.sha256'),
    "$sha  veilpoint-windows-demo-exe.zip" + [Environment]::NewLine,
    [Text.UTF8Encoding]::new($false))
  # Independently extract the actual release ZIP and verify its entrypoint,
  # WebView2 native loader, offline game closure and SHA-256 sidecar.
  Expand-Archive -LiteralPath $zip -DestinationPath $probe -Force
  foreach ($name in @('VEILPOINT.Demo.exe','START_HERE.txt','game/index.html',
                       'game/story.html','game/MANIFEST.sha256','game/src/app.js',
                       'game/src/story-app.js')) {
    if (!(Test-Path -LiteralPath (Join-Path $probe $name) -PathType Leaf)) {
      throw "Extracted Win64 package incomplete: $name"
    }
  }
  $after=(Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($after -cne $sha) { throw 'Windows EXE ZIP SHA-256 mismatch after extraction' }
  # This is a REAL PE execution on windows-latest, not a static source check.
  # --verify-package checks the bundled manifest without initializing GUI or
  # claiming WebView2/graphics/keyboard runtime acceptance.
  $publishedExe=Join-Path $probe 'VEILPOINT.Demo.exe'
  $clean=Start-Process -FilePath $publishedExe -ArgumentList '--verify-package' -Wait -PassThru
  if ($clean.ExitCode -ne 0) {
    throw "Actual Windows EXE preflight rejected the clean bundled game: $($clean.ExitCode)"
  }
  # Negative test must modify only the disposable extracted TEST copy, never
  # the release ZIP or the stage from which it was published.
  Add-Content -LiteralPath (Join-Path $probe 'game/src/app.js') -Value '// altered after extraction'
  $tampered=Start-Process -FilePath $publishedExe -ArgumentList '--verify-package' -Wait -PassThru
  if ($tampered.ExitCode -eq 0) {
    throw 'Actual Windows EXE preflight accepted corrupted game JavaScript'
  }
  # A corrupted script must not be mistaken for the *next* negative
  # test's cause. Restore the exact stage copy and certify it first.
  Copy-Item -LiteralPath (Join-Path $stage 'game/src/app.js') -Destination (Join-Path $probe 'game/src/app.js') -Force
  $restored=Start-Process -FilePath $publishedExe -ArgumentList '--verify-package' -Wait -PassThru
  if ($restored.ExitCode -ne 0) {
    throw 'Actual Windows EXE preflight rejected clean bytes after restoring JS'
  }
  # An unreferenced directory junction to an empty folder contains no files,
  # so recursive EnumerateFiles cannot detect it. The host must reject the
  # link itself rather than traversing it or trusting only manifest paths.
  $emptyTarget=Join-Path $out 'empty-reparse-probe'
  New-Item -ItemType Directory -Path $emptyTarget -Force | Out-Null
  $junction=Join-Path $probe 'game/unlisted-reparse-probe'
  New-Item -ItemType Junction -Path $junction -Target $emptyTarget | Out-Null
  try {
    $unlistedJunction=Start-Process -FilePath $publishedExe -ArgumentList '--verify-package' -Wait -PassThru
    if ($unlistedJunction.ExitCode -eq 0) {
      throw 'Actual Windows EXE preflight accepted an unlisted empty directory junction'
    }
  }
  finally {
    [IO.Directory]::Delete($junction)
  }
  Write-Host '[VEILPOINT] PE preflight executed: clean=0, tampered=nonzero, restored=0, empty-junction=nonzero (correct)'
  Write-Host "[VEILPOINT] Windows EXE package verified: $zip"
  Write-Host "[VEILPOINT] SHA256: $sha"
  Write-Host '[VEILPOINT] Windows CI build only. No interactive launch, UE5 build, signing or FPS benchmark.'
}
finally {
  Pop-Location
}
