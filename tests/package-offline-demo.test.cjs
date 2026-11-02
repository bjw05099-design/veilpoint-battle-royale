'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {collectFiles, buildZip, packageDemo, crc32} = require('../scripts/package-offline-demo.cjs');
function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'veilpoint-package-'));
  for (const p of ['src','docs']) fs.mkdirSync(path.join(dir,p));
  fs.writeFileSync(path.join(dir,'index.html'), '<script src="src/game.js"></script>');
  fs.writeFileSync(path.join(dir,'story.html'), '<script src="src/game.js"></script>');
  fs.writeFileSync(path.join(dir,'src/game.js'), 'console.log("offline")');
  for (const p of ['README.md','docs/DEMO_DELIVERY_GATES.md','docs/GRAPHICS_PROFILES.md'])
    fs.writeFileSync(path.join(dir,p), 'prototype');
  return dir;
}
test('ZIP stored entry uses correct CRC32 and signatures', () => {
  assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926);
  const zip = buildZip([{name:'a.txt',data:Buffer.from('abc')}]);
  assert.equal(zip.readUInt32LE(0), 0x04034b50);
  assert.equal(zip.readUInt32LE(zip.length-22), 0x06054b50);
  assert.equal(zip.readUInt32LE(14), crc32(Buffer.from('abc')));
  assert.equal(zip.readUInt16LE(zip.length-22+10), 1);
});
test('package is byte-identical across runs and has a manifest/checksum', () => {
  const dir = fixture();
  try {
    const first = packageDemo(dir), bytes = fs.readFileSync(first.output);
    const second = packageDemo(dir);
    assert.equal(first.sha256, second.sha256);
    assert.deepEqual(bytes, fs.readFileSync(second.output));
    assert.equal(first.files, 8); // two pages, one shared script, three docs, manifest, notice
    assert.match(fs.readFileSync(first.output+'.sha256','utf8'), /^[a-f0-9]{64}  veilpoint-offline-demo.zip\n$/);
    assert.deepEqual(collectFiles(dir).filter(f=>f.name.startsWith('src/')).map(f=>f.name), ['src/game.js']);
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
test('packager rejects remote scripts and path traversal instead of fetching content', () => {
  const dir = fixture();
  try {
    fs.writeFileSync(path.join(dir,'index.html'), '<script src="https://example.com/a.js"></script>');
    assert.throws(()=>collectFiles(dir), /Unsafe\/external/);
    fs.writeFileSync(path.join(dir,'index.html'), '<script src="../private.js"></script>');
    assert.throws(()=>collectFiles(dir), /Unsafe\/external/);
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});

test('offline packager closes direct HTML asset references and rejects remote dependencies', () => {
  const dir = fixture();
  try {
    fs.mkdirSync(path.join(dir, 'assets'));
    fs.writeFileSync(path.join(dir, 'assets', 'sign.webp'), Buffer.from('local-asset'));
    fs.appendFileSync(path.join(dir, 'index.html'), '<img src="assets/sign.webp">');
    assert.ok(collectFiles(dir).some(file => file.name === 'assets/sign.webp'));
    for (const unsafe of [
      '<img src="https://example.com/tracker.png">',
      '<link rel="stylesheet" href="//example.com/style.css">',
      '<script src="../private.js"></script>',
      '<a href="javascript:alert(1)">unsafe</a>',
      '<style>@import "https://example.com/font.css";</style>',
      '<style>body{background:url(https://example.com/a.png)}</style>'
    ]) {
      fs.writeFileSync(path.join(dir, 'index.html'),
        '<script src="src/game.js"></script>' + unsafe);
      assert.throws(() => collectFiles(dir), /Unsafe\/external asset|Unsupported CSS import\/url/);
    }
  } finally {fs.rmSync(dir, {recursive:true, force:true});}
});

test('offline page navigation is allowed but HTML pages cannot masquerade as scripts or media', () => {
  const dir = fixture();
  try {
    const valid = '<script src="src/game.js"></script><a href="story.html">Story</a><a href="#help">Help</a>';
    fs.writeFileSync(path.join(dir, 'index.html'), valid);
    assert.doesNotThrow(() => collectFiles(dir));
    for (const invalid of [
      '<script src="story.html"></script>',
      '<img src="index.html">',
      '<video poster="story.html"></video>',
      '<img src="#help">'
    ]) {
      fs.writeFileSync(path.join(dir, 'index.html'), valid + invalid);
      assert.throws(() => collectFiles(dir), /Unsafe\/external asset/);
    }
  } finally {fs.rmSync(dir, {recursive:true, force:true});}
});
