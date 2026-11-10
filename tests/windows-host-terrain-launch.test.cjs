'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.resolve(__dirname,'..',p),'utf8');
const program=read('windows/VEILPOINT.DemoHost/Program.cs');
const verifier=read('windows/VEILPOINT.DemoHost/OfflinePayloadVerifier.cs');
const page=read('terrain.html'),packager=require('../scripts/package-offline-demo.cjs');
const winWorkflow=read('.github/workflows/windows-demo-exe.yml');
test('actual Win64 WebView2 buttons expose separately verifiable BR, CH01 and synthetic 1:1 terrain scenes',()=>{
 assert.match(program,/Text = "Original Terrain Lab"/);
 assert.match(program,/header\.Controls\.Add\(terrainLab\)/);
 assert.match(program,/terrainLab\.Click \+= \(_, _\) => NavigateTo\("terrain\.html"\)/);
 assert.match(program,/terrainLab\.Enabled = !storyOnly/,
  'mixed-mode host still enables the original terrain preview');
 assert.match(program,/terrainLab\.Visible = !storyOnly/,
  'story-only host hides the non-story terrain preview');
 assert.match(program,/battleRoyale\.Enabled = !storyOnly/,
  'ordinary developer launch retains BR, restricted launch disables it');
 assert.match(program,/return uri\.AbsolutePath is "\/index\.html" or "\/story\.html" or "\/terrain\.html"/);
 assert.match(program,/OfflinePayloadVerifier\.Verify\(gameFolder\)/);
 assert.match(program,/SetVirtualHostNameToFolderMapping\(/);
 assert.match(program,/!IsLocalHost\(requested\)/);
 assert.match(program,/e\.Cancel = true/);
 assert.doesNotMatch(program,/HttpListener|Process\.Start\(|HttpClient|WebRequest/);
 assert.match(verifier,/"terrain\.html"/);
 assert.match(verifier,/"src\/aden-city-explorer\.js"/);
 assert.match(page,/src\/aden-city-explorer\.js/);
 assert.match(page,/src\/aden-city-explorer-init\.js/);
});
test('Windows launcher terrain page uses the same offline ZIP, no additional network mapping or unbundled scripts',()=>{
 const assets=packager.collectFiles();
 const names=new Set(assets.map(item=>item.name));
 for(const name of ['index.html','story.html','terrain.html',
  'src/aden-city-explorer.js','src/aden-map-relief.js',
  'src/aden-city-explorer-init.js','src/aden-citywide-tiles.js'])
  assert.ok(names.has(name),'missing offline Windows terrain view dependency '+name);
 assert.match(winWorkflow,/name: Compile real Win64 EXE and package verified offline game/);
 assert.match(winWorkflow,/name: Verify Win64 Chromium screen bounds and clickable controls/);
 assert.match(program,/Environment\.SpecialFolder\.LocalApplicationData/);
 assert.match(program,/VirtualHost = "veilpoint\.local"/);
 assert.doesNotMatch(program,/IsAllowedPage\("https:\/\//);
});
