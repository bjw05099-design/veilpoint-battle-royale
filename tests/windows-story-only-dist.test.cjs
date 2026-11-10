'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const ROOT=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(ROOT,file),'utf8');
const host=read('windows/VEILPOINT.DemoHost/Program.cs');
const verifier=read('windows/VEILPOINT.DemoHost/OfflinePayloadVerifier.cs');
const pack=read('scripts/package-windows-story-demo.ps1');
const workflow=read('.github/workflows/windows-demo-exe.yml');
const {storyEntries,verifyStoryArchive}=require('../scripts/package-story-preview.cjs');
const {buildZip}=require('../scripts/package-offline-demo.cjs');

test('BR-free Windows story distribution is detected before opening game window and verified separately',()=>{
 assert.match(host,/var storyPayload = File\.Exists/);
 assert.match(host,/!File\.Exists\(Path\.Combine\(gameFolder, "src", "app\.js"\)\)/);
 assert.match(host,/if \(storyPayload\) OfflinePayloadVerifier\.VerifyStoryOnly\(gameFolder\)/);
 assert.match(host,/else OfflinePayloadVerifier\.Verify\(gameFolder\)/);
 assert.match(host,/new DemoWindow\(storyOnly: true, storyPayload: true\)/);
 assert.match(host,/Application\.Run\(new DemoWindow\(\)\)/);
 assert.match(host,/private readonly bool storyPayload;/);
 assert.match(host,/storyOnly \? "StoryOnly" : "WebView2"/);
 assert.match(host,/storyPayload && new Uri\(e\.Uri\)\.AbsolutePath == "\/index\.html"/,
  'only the verified BR-free distribution may navigate to its own story landing page');
 assert.match(host,/FrameNavigationStarting/,
  'story-only iframe navigation remains disabled');
});

test('strict Windows verifier validates both payload types without creating a false BR-free label',()=>{
 assert.match(verifier,/public static void Verify\(string gameFolder\)/);
 assert.match(verifier,/public static void VerifyStoryOnly\(string gameFolder\)/);
 assert.match(verifier,/VerifyInternal\(gameFolder, storyOnlyPackage: (?:true|false)\)/);
 for(const required of ['src/story-app.js','src/story-slice.js','QUICK_START.txt','story.html']){
  assert.ok(verifier.includes('"'+required+'"'),'story package missing mandatory '+required);
 }
 for(const forbidden of ['src/app.js','src/br96-client.js','terrain.html','br96.html','team.html']){
  assert.ok(verifier.includes('"'+forbidden+'"'),'story-only forbids '+forbidden);
 }
 assert.match(verifier,/if \(storyOnlyPackage\)/);
 assert.match(verifier,/Non-story entry in story-only package:/);
 assert.match(verifier,/Invalid story-only landing page/);
 assert.match(verifier,/Story-only release notice missing/);
 assert.match(verifier,/SHA256\.HashData/);
 assert.match(verifier,/FileAttributes\.ReparsePoint/);
 assert.match(verifier,/Untracked file in offline game/);
});

test('actual independently hashed story ZIP contains no BR entry or terrain viewer',()=>{
 const zip=buildZip(storyEntries());
 const verified=verifyStoryArchive(zip);
 assert.equal(verified.storyOnly,true);
 assert.equal(verified.nativeUE5Verified,false);
 assert.equal(verified.fullCampaignVerified,false);
 const names=storyEntries().map(e=>e.name);
 for(const forbidden of ['src/app.js','br96.html','team.html','terrain.html','src/br96-client.js']){
  assert.ok(!names.includes(forbidden),'BR asset leaked into standalone story: '+forbidden);
 }
 for(const required of ['index.html','story.html','src/story-app.js','src/story-slice.js','MANIFEST.sha256','NOTICE.txt']){
  assert.ok(names.includes(required),'missing required story entry '+required);
 }
});

test('Win64 pipeline compiles one host but verifies and publishes a second actual BR-free EXE archive',()=>{
 assert.match(pack,/npm run package:story-preview/);
 assert.match(pack,/veilpoint-story-preview\.zip/);
 assert.match(pack,/windows-exe-publish/);
 assert.match(pack,/VEILPOINT\.Demo\.exe/);
 assert.match(pack,/Story-only EXE accepted corrupted story JavaScript|Story-only EXE rejected restored story script/);
 assert.match(pack,/Start-Process -FilePath \$probeExe -ArgumentList '--verify-package'/);
 assert.match(pack,/game\/src\/story-app\.js/);
 assert.match(pack,/src\/app\.js/);
 assert.match(pack,/Get-FileHash -LiteralPath \$zip -Algorithm SHA256/);
 assert.match(pack,/Compress-Archive -Path/);
 assert.match(pack,/Expand-Archive -LiteralPath \$zip/);
 const first=workflow.indexOf('Compile real Win64 EXE and package verified offline game');
 const second=workflow.indexOf('Package independent BR-free Story CH01 Windows EXE');
 const upload=workflow.indexOf('Upload independent Story CH01 Windows EXE candidate');
 assert.ok(first>=0&&second>first&&upload>second,'story host package must follow compiled main EXE and precede upload');
 assert.match(workflow,/veilpoint-story-windows-exe-candidate/);
 assert.match(workflow,/veilpoint-story-windows-exe\.zip\.sha256/);
 assert.match(workflow,/Upload unsigned Windows EXE demo candidate/,'combined BR dev package remains available');
});
