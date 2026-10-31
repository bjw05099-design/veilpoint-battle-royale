'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {packageDemo, buildZip} = require('../scripts/package-offline-demo.cjs');
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
