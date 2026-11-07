'use strict';
// Static release contracts. A green Node test is NOT a Windows compile or
// a real Windows 10/11 WebView2 launch. Windows Actions performs those builds.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const csproj=read('windows/VEILPOINT.DemoHost/VEILPOINT.DemoHost.csproj');
const host=read('windows/VEILPOINT.DemoHost/Program.cs');
const verifier=read('windows/VEILPOINT.DemoHost/OfflinePayloadVerifier.cs');
const winbuild=read('scripts/package-windows-demo.ps1');
const workflow=read('.github/workflows/windows-demo-exe.yml');
const browserCi=read('.github/workflows/ci.yml');

test('Win64 demo is a real self-contained .NET WinExe project, separately labeled from UE5',()=>{
 assert.match(csproj,/<OutputType>WinExe<\/OutputType>/);
 assert.match(csproj,/<TargetFramework>net10\.0-windows<\/TargetFramework>/);
 assert.match(csproj,/<RuntimeIdentifier>win-x64<\/RuntimeIdentifier>/);
 assert.match(csproj,/<SelfContained>true<\/SelfContained>/);
 assert.match(csproj,/<UseWindowsForms>true<\/UseWindowsForms>/);
 assert.match(csproj,/<PublishSingleFile>true<\/PublishSingleFile>/);
 assert.match(csproj,/<PackageReference Include="Microsoft\.Web\.WebView2" Version="[0-9.]+"/);
 assert.match(host,/Application\.Run\(new DemoWindow\(\)\)/);
 assert.match(host,/not an Unreal Engine native game/i);
 assert.doesNotMatch(csproj,/UnrealBuildTool|\.uproject/);
});

test('Win64 host maps only bundled game content to a stable, local saved-game origin',()=>{
 assert.match(host,/Path\.Combine\(AppContext\.BaseDirectory, "game"\)/);
 assert.match(host,/OfflinePayloadVerifier\.Verify\(gameFolder\)/);
 assert.match(host,/CoreWebView2Environment\.CreateAsync\(/);
 assert.match(host,/Environment\.SpecialFolder\.LocalApplicationData/);
 assert.match(host,/SetVirtualHostNameToFolderMapping\(/);
 assert.match(host,/CoreWebView2HostResourceAccessKind\.DenyCors/);
 assert.match(host,/NavigateTo\("index\.html"\)/);
 assert.match(host,/NavigateTo\("story\.html"\)/);
 assert.doesNotMatch(host,/Process\.Start\(|HttpListener|HttpClient|WebRequest/);
});

test('Win64 host blocks remote navigation AND subresources, without hiding WebView2 prerequisite',()=>{
 assert.match(host,/IsAllowedPage\(e\.Uri\)/);
 assert.match(host,/e\.Cancel = true;/);
 assert.match(host,/e\.Handled = true;/);
 assert.match(host,/AddWebResourceRequestedFilter\(/);
 assert.match(host,/WebResourceRequested \+=/);
 assert.match(host,/!IsLocalHost\(requested\)/);
 assert.match(host,/CreateWebResourceResponse\(/);
 assert.match(host,/Settings\.AreDevToolsEnabled = false/);
 assert.match(host,/WebView2 runtime/);
 assert.match(host,/no UE5 executable/i);
});

test('Windows EXE zip is independently verified after actual Win64 dotnet publish',()=>{
 assert.match(winbuild,/if \(\$env:OS -ne 'Windows_NT'\)/);
 assert.match(winbuild,/npm run package:demo/);
 assert.match(winbuild,/dotnet publish \$project -c Release -r win-x64 --self-contained true/);
 assert.match(winbuild,/PublishSingleFile=true/);
 assert.match(winbuild,/VEILPOINT\.Demo\.exe/);
 assert.match(winbuild,/Get-ChildItem -LiteralPath \$stage -Recurse -File -Filter 'WebView2Loader\.dll'/);
 assert.match(winbuild,/Expand-Archive -LiteralPath \$demoZip -DestinationPath \$game/);
 assert.match(winbuild,/Compress-Archive -Path/);
 assert.match(winbuild,/Get-FileHash -LiteralPath \$zip -Algorithm SHA256/);
 assert.match(winbuild,/Expand-Archive -LiteralPath \$zip -DestinationPath \$probe/);
 assert.match(winbuild,/game\/src\/story-app\.js/);
 assert.match(winbuild,/EXE.*NOT.*UE5|NOT a compiled Unreal Engine 5/i);
 assert.match(winbuild,/install.*WebView2|WebView2.*runtime/i);
});

test('Windows runner produces separate EXE artifact without replacing P0 browser ZIP gate',()=>{
 assert.match(workflow,/runs-on: windows-latest/);
 assert.match(workflow,/setup-dotnet@v4/);
 assert.match(workflow,/dotnet-version: '10\.0\.x'/);
 assert.match(workflow,/package-windows-demo\.ps1/);
 assert.match(workflow,/veilpoint-windows-demo-exe-candidate/);
 assert.match(workflow,/veilpoint-windows-demo-exe\.zip\.sha256/);
 assert.match(browserCi,/runs-on: ubuntu-latest/);
 assert.match(browserCi,/npm run package:demo/);
 assert.match(browserCi,/veilpoint-offline-demo-candidate/);
});

test('real EXE validates all bundled manifest SHA256 entries before loading any browser script',()=>{
 assert.match(host,/OfflinePayloadVerifier\.Verify\(gameFolder\)/);
 assert.match(host,/args\[0\] == "--verify-package"/);
 assert.match(host,/return 7;/);
 assert.match(verifier,/MANIFEST\.sha256/);
 assert.match(verifier,/HashSet<string>\(StringComparer\.OrdinalIgnoreCase\)/);
 assert.match(verifier,/MaxEntries = 128/);
 assert.match(verifier,/MaxTotalBytes = 16 \* 1024 \* 1024/);
 assert.match(verifier,/MaxFileBytes = 2 \* 1024 \* 1024/);
 assert.match(verifier,/SHA256\.HashData\(File\.ReadAllBytes\(file\)\)/);
 assert.match(verifier,/checksum mismatch/);
 assert.match(verifier,/Untracked file in offline game/);
 assert.match(verifier,/FileAttributes\.ReparsePoint/);
 assert.doesNotMatch(verifier,/https?:\/\/|HttpClient|WebRequest/);
});

test('Windows runner launches compiled EXE preflight and rejects a post-extraction damaged JS asset',()=>{
 assert.match(winbuild,/Start-Process -FilePath \$publishedExe -ArgumentList '--verify-package' -Wait -PassThru/);
 assert.match(winbuild,/if \(\$clean\.ExitCode -ne 0\)/);
 assert.match(winbuild,/Add-Content -LiteralPath \(Join-Path \$probe 'game\/src\/app\.js'\)/);
 assert.match(winbuild,/if \(\$tampered\.ExitCode -eq 0\)/);
 assert.match(winbuild,/clean=0, tampered=nonzero/);
 assert.match(host,/not an Unreal Engine native game/i);
});

test('Win64 build tracks supported .NET 10 LTS and retains release candidate through demo day',()=>{
 assert.ok(csproj.includes('<TargetFramework>net10.0-windows</TargetFramework>'));
 assert.ok(workflow.includes("dotnet-version: '10.0.x'"));
 assert.ok(winbuild.includes('.NET SDK 10'));
 assert.ok(workflow.includes('retention-days: 45'));
 for(const source of ['README.md','docs/DEMO_DELIVERY_GATES.md','docs/GRAPHICS_PROFILES.md']){
  const needle="      - '"+source+"'";
  assert.equal(workflow.split(needle).length-1,2,
    'Windows EXE must rebuild on changes to bundled browser docs: '+source);
 }
});

test('Windows geometry evidence changes trigger Windows build and real regression tests',()=>{
 for(const changed of ['scripts/validate-pc-geometry.cjs','tests/pc-geometry-evidence.test.cjs']){
  const trigger="      - '"+changed+"'";
  assert.equal(workflow.split(trigger).length-1,2,
   'Both push and PR Windows workflows must run when '+changed+' changes');
 }
 assert.match(workflow,/node --test tests\/pc-chromium-geometry-gate\.test\.cjs tests\/pc-geometry-evidence\.test\.cjs/,
  'Win64 must execute the same geometry evidence regression tests');
});
