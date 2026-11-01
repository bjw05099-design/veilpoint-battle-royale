'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const {packageDemo, collectFiles, buildZip} = require('../scripts/package-offline-demo.cjs');
const {inspectZip, verifyArchive, verifyPackage} = require('../scripts/verify-offline-demo.cjs');
function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'veilpoint-verify-'));
  fs.mkdirSync(path.join(dir, 'src'));
  fs.mkdirSync(path.join(dir, 'docs'));
  fs.writeFileSync(path.join(dir, 'index.html'), '<script src="src/game.js"></script><a href="story.html">Story</a>');
  fs.writeFileSync(path.join(dir, 'story.html'), '<script src="src/game.js"></script>');
  fs.writeFileSync(path.join(dir, 'src/game.js'), 'console.log("local")');
  for (const file of ['README.md', 'docs/DEMO_DELIVERY_GATES.md', 'docs/GRAPHICS_PROFILES.md'])
    fs.writeFileSync(path.join(dir, file), 'candidate');
  return dir;
}
test('independent ZIP inspection validates stored CRCs, per-file SHA256 and sidecar', () => {
  const dir = fixture();
  try {
    const made = packageDemo(dir);
    const checked = verifyPackage(made.output);
    assert.equal(checked.sha256, made.sha256);
    assert.equal(checked.files, 8);
    assert.equal(inspectZip(fs.readFileSync(made.output)).size, 8);
  } finally {fs.rmSync(dir, {recursive:true, force:true});}
});
test('corrupted archive bytes and duplicate paths are rejected', () => {
  const dir = fixture();
  try {
    const made = packageDemo(dir);
    const bytes = fs.readFileSync(made.output);
    const tampered = Buffer.from(bytes);
    const position = tampered.indexOf(Buffer.from('console.log'));
    assert.ok(position >= 0);
    tampered[position] ^= 1;
    assert.throws(() => verifyArchive(tampered), /invalid_demo_zip:crc/);
    const duplicate = buildZip([{name:'same.txt', data:Buffer.from('one')},
      {name:'same.txt', data:Buffer.from('two')}]);
    assert.throws(() => inspectZip(duplicate), /invalid_demo_zip:entry_name/);
  } finally {fs.rmSync(dir, {recursive:true, force:true});}
});
test('sidecar mismatch cannot be reported as verified delivery', () => {
  const dir = fixture();
  try {
    const made = packageDemo(dir);
    fs.writeFileSync(made.output + '.sha256', '0'.repeat(64) + '  veilpoint-offline-demo.zip\n');
    assert.throws(() => verifyPackage(made.output), /invalid_demo_zip:sidecar/);
  } finally {fs.rmSync(dir, {recursive:true, force:true});}
});

function archiveWithValidManifest(files) {
  const digest = data => crypto.createHash('sha256').update(data).digest('hex');
  const manifest = files.map(f => digest(f.data) + '  ' + f.name).join('\n') + '\n';
  return buildZip([...files, {name: 'MANIFEST.sha256', data: Buffer.from(manifest)},
    {name: 'NOTICE.txt', data: Buffer.from('offline candidate')}]
    .sort((a, b) => a.name.localeCompare(b.name, 'en')));
}

test('verified ZIP cannot silently omit referenced scripts despite a valid manifest', () => {
  const dir = fixture();
  try {
    const complete = collectFiles(dir);
    const withoutScript = archiveWithValidManifest(complete.filter(f => f.name !== 'src/game.js'));
    assert.throws(() => verifyArchive(withoutScript), /invalid_demo_zip:missing_asset:src\/game.js/);
    const withoutReadme = archiveWithValidManifest(complete.filter(f => f.name !== 'README.md'));
    assert.throws(() => verifyArchive(withoutReadme), /invalid_demo_zip:required_files/);
    const unsafe = complete.map(f => f.name === 'index.html'
      ? {name: f.name, data: Buffer.from('<script src="https://example.com/remote.js"></script>')}
      : f);
    assert.throws(() => verifyArchive(archiveWithValidManifest(unsafe)),
      /invalid_demo_zip:html_assets:index.html/);
  } finally {fs.rmSync(dir, {recursive:true, force:true});}
});

test('ZIP verification rejects untracked local-record padding even with valid CRCs', () => {
  const zip = buildZip([{name:'a.txt', data:Buffer.from('abc')},
    {name:'b.txt', data:Buffer.from('def')}]);
  const end = zip.length - 22, directoryOffset = zip.readUInt32LE(end + 16);
  const padded = Buffer.concat([zip.subarray(0, directoryOffset),
    Buffer.from([0x7f]), zip.subarray(directoryOffset)]);
  padded.writeUInt32LE(directoryOffset + 1, padded.length - 22 + 16);
  assert.throws(() => inspectZip(padded), /invalid_demo_zip:local_layout/);
});
