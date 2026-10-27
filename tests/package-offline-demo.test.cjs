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
