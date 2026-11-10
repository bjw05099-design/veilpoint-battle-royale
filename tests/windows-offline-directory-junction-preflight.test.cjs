'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.resolve(__dirname,'..',p),'utf8');
const verifier=read('windows/VEILPOINT.DemoHost/OfflinePayloadVerifier.cs');
const build=read('scripts/package-windows-demo.ps1');

test('Windows offline host enumerates every directory entry before loading game scripts',()=>{
  assert.match(verifier,/Directory\.EnumerateFileSystemEntries\(directory\)/,
    'an empty untracked junction is not visible in recursive EnumerateFiles');
  assert.match(verifier,/FileAttributes\.ReparsePoint/);
  assert.match(verifier,/Untracked directory in offline game/);
  assert.match(verifier,/Untracked file in offline game/);
  assert.match(verifier,/inspectedDirectories > MaxEntries \+ 1/,
    'a malformed layout must not cause unbounded traversal');
  assert.doesNotMatch(verifier,/Directory\.EnumerateFiles\(root, "\*", SearchOption\.AllDirectories\)/);
});

test('Windows CI executes the real packaged PE against both damaged JS and an empty untracked junction',()=>{
  const restore=build.indexOf("Copy-Item -LiteralPath (Join-Path $stage 'game/src/app.js')");
  const newLink=build.indexOf('New-Item -ItemType Junction');
  assert.ok(restore>0&&newLink>restore,'test must restore good bytes before isolated junction probe');
  assert.match(build,/\$restored\.ExitCode -ne 0/);
  assert.match(build,/\$unlistedJunction\.ExitCode -eq 0/);
  assert.match(build,/\[IO\.Directory\]::Delete\(\$junction\)/);
  assert.match(build,/Start-Process -FilePath \$publishedExe -ArgumentList '--verify-package' -Wait -PassThru/);
  assert.match(build,/empty-junction=nonzero/);
});
