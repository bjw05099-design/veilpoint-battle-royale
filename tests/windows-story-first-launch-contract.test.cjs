'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const host=read('windows/VEILPOINT.DemoHost/Program.cs');
const manual=read('docs/WINDOWS_EXE_DEMO.md');
const winPackage=read('scripts/package-windows-demo.ps1');
const viewport=read('scripts/verify-pc-viewport.cjs');
const readme=read('README.md');
const first=host.indexOf('private async Task InitializeHostAsync()');
const launch=host.slice(first);

test('Win64 combined development host opens actual CH01 first and retains separate BR entry',()=>{
 assert.ok(first>0);
 assert.match(launch,/NavigateTo\("story\.html"\);/);
 assert.doesNotMatch(launch,/NavigateTo\("index\.html"\);/);
 assert.match(host,/header\.Controls\.Add\(story\);\s*header\.Controls\.Add\(battleRoyale\);/);
 assert.match(host,/battleRoyale\.Click \+= \(_, _\) => NavigateTo\("index\.html"\)/);
 assert.match(host,/story\.Click \+= \(_, _\) => NavigateTo\("story\.html"\)/);
 assert.match(manual,/CH01.*first|story-first|story-first.*CH01/i);
});

test('optional story-only host blocks BR and terrain navigation at every entry point',()=>{
 assert.match(host,/args\.Length == 1 && args\[0\] == "--story-only"/);
 assert.match(host,/new DemoWindow\(storyOnly: true\)/);
 assert.match(host,/battleRoyale\.Visible = !storyOnly/);
 assert.match(host,/terrainLab\.Visible = !storyOnly/);
 assert.match(host,/battleRoyale\.Enabled = !storyOnly/);
 assert.match(host,/terrainLab\.Enabled = !storyOnly/);
 assert.match(host,/IsAllowedPage\(destination\) && \(!storyOnly \|\| page == "story\.html"\)/);
 const navigation=host.slice(host.indexOf('core.NavigationStarting +='));
 const popup=host.slice(host.indexOf('core.NewWindowRequested +='));
 for(const handler of [navigation,popup]){
  assert.match(handler,/IsAllowedPage\(e\.Uri\)/);
  assert.match(handler,/!storyOnly \|\| new Uri\(e\.Uri\)\.AbsolutePath == "\/story\.html"/);
 }
 assert.match(host,/core\.WebResourceRequested \+=/);
 assert.match(host,/!IsLocalHost\(requested\)/);
 assert.match(host,/core\.FrameNavigationStarting \+=/);
 assert.match(host,/if \(storyOnly\) e\.Cancel = true/);
 assert.match(host,/storyOnly \? "StoryOnly" : "WebView2"/);
 assert.match(manual,/DemoHost\\StoryOnly/);
 assert.match(host,/OfflinePayloadVerifier\.Verify\(gameFolder\)/);
 assert.match(host,/Application\.Run\(new DemoWindow\(\)\)/,
  'mixed dev host must remain accessible to later BR development');
 assert.match(manual,/--story-only/);
 assert.match(manual,/\\VEILPOINT\.Demo\.exe --story-only/);
 assert.match(winPackage,/CH01 STORY opens FIRST/);
 assert.match(winPackage,/VEILPOINT\.Demo\.exe --story-only/);
 assert.doesNotMatch(manual,/story-only.*native UE5 game/i);
});

test('current quick start cannot advertise obsolete E as CH01 default or touch as a PC release path',()=>{
 const latest=readme.slice(0,readme.indexOf('### Current gameplay features'));
 assert.match(latest,/F.*interact|F.*상호작용|F.*interaction/i);
 assert.match(latest,/PC-only|Windows PC only/i);
 assert.doesNotMatch(latest,/E interact|E collect resources|press \*\*E\*\*/i);
 assert.match(latest,/2026-11-10/);
});

test('CDP runner gives slow Chrome a bounded chance but never turns failed startup into passing geometry',()=>{
 assert.match(viewport,/const startupDeadline=Date\.now\(\)\+20000/);
 assert.match(viewport,/for\(let tries=0;Date\.now\(\)<startupDeadline;tries\+\+\)/);
 assert.match(viewport,/AbortSignal\.timeout\(1000\)/);
 assert.match(viewport,/for\(startupAttempts=1;startupAttempts<=2;startupAttempts\+\+\)/);
 assert.match(viewport,/throw new Error\('Chromium DevTools not ready/);
 assert.match(viewport,/Viewport geometry gate failed:/);
 assert.match(viewport,/records\.length\+'\/'\+SIZES\.length/);
});
