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
const winbuild=read('scripts/package-windows-demo.ps1');
const workflow=read('.github/workflows/windows-demo-exe.yml');
const browserCi=read('.github/workflows/ci.yml');

test('Win64 demo is a real self-contained .NET WinExe project, separately labeled from UE5',()=>{
 assert.match(csproj,/<OutputType>WinExe<\/OutputType>/);
 assert.match(csproj,/<TargetFramework>net8\.0-windows<\/TargetFramework>/);
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
 assert.match(host,/File\.Exists\(Path\.Combine\(gameFolder, "index\.html"\)\)/);
 assert.match(host,/File\.Exists\(Path\.Combine\(gameFolder, "story\.html"\)\)/);
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
 assert.match(workflow,/dotnet-version: '8\.0\.x'/);
 assert.match(workflow,/package-windows-demo\.ps1/);
 assert.match(workflow,/veilpoint-windows-demo-exe-candidate/);
 assert.match(workflow,/veilpoint-windows-demo-exe\.zip\.sha256/);
 assert.match(browserCi,/runs-on: ubuntu-latest/);
 assert.match(browserCi,/npm run package:demo/);
 assert.match(browserCi,/veilpoint-offline-demo-candidate/);
});
