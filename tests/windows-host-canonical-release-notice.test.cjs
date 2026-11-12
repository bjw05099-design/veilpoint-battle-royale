'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const source=p=>fs.readFileSync(path.join(root,p),'utf8');
const {NOTICE_TEXT}=require('../scripts/package-offline-demo.cjs');
const {NOTICE}=require('../scripts/package-story-preview.cjs');

function declaredNotice(name){
 const cs=source('windows/VEILPOINT.DemoHost/OfflinePayloadVerifier.cs');
 const match=cs.match(new RegExp('private const string '+name+'\\s*=\\s*([\\s\\S]*?);'));
 assert.ok(match,'C# Windows host must declare canonical '+name);
 const pieces=match[1].match(/"(?:[^"\\]|\\.)*"/g);
 assert.ok(pieces&&pieces.length===2);
 return pieces.map(part=>JSON.parse(part)).join('');
}

test('the mixed and BR-free Windows hosts compare exact release notices to the actual two ZIP packagers',()=>{
 const cs=source('windows/VEILPOINT.DemoHost/OfflinePayloadVerifier.cs');
 assert.equal(declaredNotice('CombinedNotice'),NOTICE_TEXT);
 assert.equal(declaredNotice('StoryOnlyNotice'),NOTICE);
 assert.match(cs,/File\.ReadAllBytes\(noticePath\)\.SequenceEqual\(expectedNotice\)/);
 assert.match(cs,/storyOnlyPackage\s*\?\s*StoryOnlyNotice\s*:\s*CombinedNotice/);
 assert.match(cs,/Offline release limitation notice mismatch/);
 // The notices are intentionally excluded from manifests. A clean EXE alone
 // does not prove authenticity if it accepts a changed unmanifested notice.
 assert.match(source('scripts/package-offline-demo.cjs'),/name:'NOTICE\.txt'/);
 assert.match(source('scripts/package-story-preview.cjs'),/name:'NOTICE\.txt'/);
});

test('Windows CI executes the actual compiled EXE against modified and restored notices in both distributions',()=>{
 for(const script of ['scripts/package-windows-demo.ps1',
   'scripts/package-windows-story-demo.ps1']){
  const ps=source(script);
  assert.match(ps,/\$noticePath=Join-Path \$probe 'game\/NOTICE\.txt'/);
  assert.match(ps,/\$badNotice=Start-Process -FilePath \$\w+ -ArgumentList '--verify-package' -Wait -PassThru/);
  assert.match(ps,/if \(\$badNotice\.ExitCode -eq 0\)/);
  assert.match(ps,/Copy-Item -LiteralPath \(Join-Path \$stage 'game\/NOTICE\.txt'\) -Destination \$noticePath -Force/);
  assert.match(ps,/\$goodNotice=Start-Process -FilePath \$\w+ -ArgumentList '--verify-package' -Wait -PassThru/);
  assert.match(ps,/if \(\$goodNotice\.ExitCode -ne 0\)/);
 }
 const workflow=source('.github/workflows/windows-demo-exe.yml');
 assert.match(workflow,/\.\/scripts\/package-windows-demo\.ps1/);
 assert.match(workflow,/\.\/scripts\/package-windows-story-demo\.ps1/);
});
