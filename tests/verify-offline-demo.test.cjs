'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const {packageDemo, collectFiles, buildZip, QUICK_START_TEXT, NOTICE_TEXT} = require('../scripts/package-offline-demo.cjs');
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
    assert.equal(checked.files, 9);
    assert.equal(inspectZip(fs.readFileSync(made.output)).size, 9);
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
  const shipment = [...files, {name:'QUICK_START.txt', data:Buffer.from(QUICK_START_TEXT)}];
  const manifest = shipment.sort((a,b)=>a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
    .map(f => digest(f.data) + '  ' + f.name).join('\n') + '\n';
  return buildZip([...shipment, {name:'MANIFEST.sha256', data:Buffer.from(manifest)},
    {name:'NOTICE.txt', data:Buffer.from(NOTICE_TEXT)}]
    .sort((a,b) => a.name.localeCompare(b.name, 'en')));
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

test('self-consistent ZIP cannot omit an unquoted browser asset reference', () => {
  const dir = fixture();
  try {
    const files = collectFiles(dir).map(file => file.name === 'index.html'
      ? {...file, data: Buffer.from('<script src="src/game.js"></script><img src=assets/missing.webp>')}
      : file);
    assert.throws(() => verifyArchive(archiveWithValidManifest(files)),
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

test('self-consistent archive cannot smuggle unreferenced executable files', () => {
  const dir = fixture();
  try {
    const complete = collectFiles(dir);
    const extra = {name: 'src/unused.js', data: Buffer.from('console.log("unexpected")')};
    const archive = archiveWithValidManifest([...complete, extra]);
    assert.throws(() => verifyArchive(archive),
      /invalid_demo_zip:unexpected_file:src\/unused\.js/);
    assert.doesNotThrow(() => verifyArchive(archiveWithValidManifest(complete)),
      'referenced scripts and the original static files remain valid');
  } finally {fs.rmSync(dir, {recursive:true, force:true});}
});

test('lossless DEFLATE reduces repetitive demo data and verifier restores exact bytes', () => {
  const original = Buffer.from('VEILPOINT offline source and assets\\n'.repeat(500));
  const entries = [{name: 'src/scene.js', data: original}];
  const compact = buildZip(entries);
  const baseline = buildZip(entries, {compress: false});
  assert.equal(compact.readUInt16LE(8), 8);
  assert.ok(compact.length < baseline.length / 2);
  assert.deepEqual(inspectZip(compact).get('src/scene.js'), original);
  const tampered = Buffer.from(compact);
  tampered[30 + Buffer.byteLength('src/scene.js') + 1] ^= 0xff;
  assert.throws(() => inspectZip(tampered), /invalid_demo_zip:(?:deflate|crc)/);
});

test('DEFLATE payload cannot hide trailing bytes behind a valid end marker and CRC', () => {
  const original = Buffer.from('VEILPOINT local source '.repeat(500));
  const zip = buildZip([{name: 'a.txt', data: original}]);
  assert.equal(zip.readUInt16LE(8), 8, 'fixture must be a compressed ZIP entry');
  const localEnd = 30 + zip.readUInt16LE(26) + zip.readUInt32LE(18);
  const oldDirectory = zip.readUInt32LE(zip.length - 22 + 16);
  assert.equal(localEnd, oldDirectory);
  const tail = Buffer.from([0x01, 0x02, 0x03, 0x04]);
  const altered = Buffer.concat([zip.subarray(0, localEnd), tail, zip.subarray(localEnd)]);
  // Forge a self-consistent packed length and directory offset. Uncompressed
  // content, CRC32 and SHA256 stay unchanged; a normal inflate ignores the tail.
  altered.writeUInt32LE(zip.readUInt32LE(18) + tail.length, 18);
  altered.writeUInt32LE(zip.readUInt32LE(18) + tail.length, oldDirectory + tail.length + 20);
  altered.writeUInt32LE(oldDirectory + tail.length, altered.length - 22 + 16);
  assert.throws(() => inspectZip(altered), /invalid_demo_zip:deflate_trailing:a\.txt/);
  assert.deepEqual(inspectZip(zip).get('a.txt'), original);
});

test('DEFLATE entry sizes are bounded before inflation', () => {
  const compact = buildZip([{name: 'a.txt', data: Buffer.from('x'.repeat(4000))}]);
  const fake = Buffer.from(compact);
  const directory = fake.readUInt32LE(fake.length - 22 + 16);
  fake.writeUInt32LE(2 * 1024 * 1024 + 1, directory + 24);
  fake.writeUInt32LE(2 * 1024 * 1024 + 1, 22);
  assert.throws(() => inspectZip(fake), /invalid_demo_zip:entry_uncompressed_too_large/);
});

test('ZIP inspection bounds archive bytes and directory entries before parsing', () => {
  assert.throws(() => inspectZip(Buffer.alloc(16 * 1024 * 1024 + 1)),
    /invalid_demo_zip:archive_too_large/);
  const many = buildZip(Array.from({length:129}, (_, i) => ({
    name: 'f' + i + '.txt', data: Buffer.from('x')
  })));
  assert.throws(() => inspectZip(many), /invalid_demo_zip:entry_count/);
});

test('ZIP inspection rejects hidden local and directory extras even with intact file CRC', () => {
  const zip = buildZip([{name:'a.txt', data:Buffer.from('abc')}]);
  const end = zip.length - 22;
  const directoryOffset = zip.readUInt32LE(end + 16);
  const localDataStart = 30 + zip.readUInt16LE(26);
  const localExtra = Buffer.concat([zip.subarray(0, localDataStart),
    Buffer.from([0x7f]), zip.subarray(localDataStart)]);
  localExtra.writeUInt16LE(1, 28);
  localExtra.writeUInt32LE(directoryOffset + 1, localExtra.length - 22 + 16);
  assert.throws(() => inspectZip(localExtra), /invalid_demo_zip:local_metadata/);

  const centralNameEnd = directoryOffset + 46 + zip.readUInt16LE(directoryOffset + 28);
  const directoryExtra = Buffer.concat([zip.subarray(0, centralNameEnd),
    Buffer.from([0x7f]), zip.subarray(centralNameEnd)]);
  directoryExtra.writeUInt16LE(1, directoryOffset + 30);
  directoryExtra.writeUInt32LE(zip.readUInt32LE(end + 12) + 1,
    directoryExtra.length - 22 + 12);
  assert.throws(() => inspectZip(directoryExtra), /invalid_demo_zip:directory_metadata/);
  assert.equal(inspectZip(zip).get('a.txt').toString(), 'abc');
});

test('ZIP inspection rejects alternate versions and Windows case-folding aliases', () => {
  const zip = buildZip([{name:'a.txt', data:Buffer.from('abc')}]);
  const badLocalVersion = Buffer.from(zip);
  badLocalVersion.writeUInt16LE(45, 4);
  assert.throws(() => inspectZip(badLocalVersion), /invalid_demo_zip:local_metadata/);
  const directoryOffset = zip.readUInt32LE(zip.length - 22 + 16);
  const badCentralVersion = Buffer.from(zip);
  badCentralVersion.writeUInt16LE(45, directoryOffset + 6);
  assert.throws(() => inspectZip(badCentralVersion), /invalid_demo_zip:directory_metadata/);
  const aliases = buildZip([{name:'src/Map.js', data:Buffer.from('one')},
    {name:'src/map.js', data:Buffer.from('two')}]);
  assert.throws(() => inspectZip(aliases), /invalid_demo_zip:entry_name/);
});

test('self-consistent ZIP with remote CSS dependency cannot pass offline verification', () => {
  const dir = fixture();
  try {
    fs.writeFileSync(path.join(dir, 'index.html'),
      '<script src="src/game.js"></script><link rel="stylesheet" href="src/theme.css">');
    fs.writeFileSync(path.join(dir, 'src/theme.css'), 'body { color: white; }');
    const safe = collectFiles(dir);
    assert.doesNotThrow(() => verifyArchive(archiveWithValidManifest(safe)));
    const unsafe = safe.map(file => file.name === 'src/theme.css'
      ? {...file, data: Buffer.from('@import "https://example.com/remote.css";')}
      : file);
    assert.throws(() => verifyArchive(archiveWithValidManifest(unsafe)),
      /invalid_demo_zip:asset_dependencies/);
  } finally {fs.rmSync(dir, {recursive: true, force: true});}
});

test('valid-manifest ZIP cannot hide remote image-set inside inline page CSS', () => {
  const dir = fixture();
  try {
    const files = collectFiles(dir).map(file => file.name === 'story.html'
      ? {...file, data: Buffer.from('<script src="src/game.js"></script><style>body{background:image-set("https://example.com/remote.png" 1x)}</style>')}
      : file);
    assert.throws(() => verifyArchive(archiveWithValidManifest(files)),
      /invalid_demo_zip:html_assets:story\.html/);
  } finally {fs.rmSync(dir, {recursive: true, force: true});}
});

test('self-consistent ZIP with hidden JavaScript fetch cannot be certified offline', () => {
  const dir = fixture();
  try {
    const complete = collectFiles(dir);
    for (const source of [
      'fetch("https://example.invalid/hidden.js")',
      'const img = new Image(); img.src = "https://example.invalid/pixel.png";'
    ]) {
      const remote = complete.map(file => file.name === 'src/game.js'
        ? {...file, data: Buffer.from(source)}
        : file);
      assert.throws(() => verifyArchive(archiveWithValidManifest(remote)),
        /invalid_demo_zip:asset_dependencies:src\/game\.js/);
    }
    const inline = complete.map(file => file.name === 'index.html'
      ? {...file, data: Buffer.from('<script src="src/game.js"></script><script>fetch("/missing")</script>')}
      : file);
    assert.throws(() => verifyArchive(archiveWithValidManifest(inline)),
      /invalid_demo_zip:html_assets:index\.html/);
    assert.doesNotThrow(() => verifyArchive(archiveWithValidManifest(complete)));
  } finally {fs.rmSync(dir, {recursive: true, force: true});}
});
