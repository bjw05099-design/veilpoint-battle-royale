'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const {collectFiles, buildZip, packageDemo} = require('../scripts/package-offline-demo.cjs');
const {verifyArchive} = require('../scripts/verify-offline-demo.cjs');

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'veilpoint-offline-closure-'));
  fs.mkdirSync(path.join(root, 'src'));
  fs.mkdirSync(path.join(root, 'assets'));
  fs.mkdirSync(path.join(root, 'docs'));
  fs.writeFileSync(path.join(root, 'index.html'),
    '<script src="src/game.js"></script><img src="assets/mark.svg">');
  fs.writeFileSync(path.join(root, 'story.html'),
    '<script src="src/game.js"></script>');
  fs.writeFileSync(path.join(root, 'src/game.js'), 'console.log("offline");');
  fs.writeFileSync(path.join(root, 'assets/mark.svg'),
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="3"/></svg>');
  for (const file of ['README.md','docs/DEMO_DELIVERY_GATES.md','docs/GRAPHICS_PROFILES.md'])
    fs.writeFileSync(path.join(root, file), 'demo');
  return root;
}

function forgedArchive(files) {
  const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
  const manifest = files.map(file => digest(file.data) + '  ' + file.name).join('\n') + '\n';
  return buildZip([...files, {name:'MANIFEST.sha256', data:Buffer.from(manifest)},
    {name:'NOTICE.txt', data:Buffer.from('offline demo')}]
    .sort((a,b) => a.name.localeCompare(b.name,'en')));
}

test('active HTML embeds and submission endpoints cannot hide network requirements', () => {
  const root = fixture();
  try {
    const baseline = fs.readFileSync(path.join(root,'index.html'),'utf8');
    for (const unsafe of [
      '<object data="https://example.invalid/remote.svg"></object>',
      '<iframe srcdoc="&lt;img src=https://example.invalid/x&gt;"></iframe>',
      '<embed src="assets/mark.svg">',
      '<form action="https://example.invalid/post"><button>Send</button></form>',
      '<button formaction="https://example.invalid/post">Send</button>',
      '<base href="https://example.invalid/">'
    ]) {
      fs.writeFileSync(path.join(root,'index.html'), baseline + unsafe);
      assert.throws(() => collectFiles(root), /Unsupported active HTML dependency/,
        'must reject unsupported active HTML: ' + unsafe);
    }
    fs.writeFileSync(path.join(root,'index.html'), baseline);
    assert.doesNotThrow(() => collectFiles(root));
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});

test('bundled SVG permits self-contained geometry but rejects executable or remote dependencies', () => {
  const root = fixture();
  try {
    const file = path.join(root,'assets/mark.svg');
    assert.doesNotThrow(() => collectFiles(root));
    for (const svg of [
      '<svg xmlns="http://www.w3.org/2000/svg"><image href="https://example.invalid/pixel.png"/></svg>',
      '<svg><script>console.log("not a static asset")</script></svg>',
      '<svg><rect onload="console.log(1)"/></svg>',
      '<svg><style>@import "https://example.invalid/style.css";</style></svg>',
      '<svg><rect style="fill:url(https://example.invalid/pattern.svg)"/></svg>',
      '<svg><foreignObject><iframe src="https://example.invalid/"/></foreignObject></svg>',
      '<!DOCTYPE svg [<!ENTITY remote SYSTEM "https://example.invalid/x">]><svg/>',
      '<?xml-stylesheet href="https://example.invalid/x.css"?><svg/>'
    ]) {
      fs.writeFileSync(file,svg);
      assert.throws(() => collectFiles(root), /Unsupported SVG dependency/,
        'SVG dependency must fail closed: ' + svg);
    }
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});

test('independent ZIP verifier rejects forged but checksum-consistent active HTML and SVG', () => {
  const root = fixture();
  try {
    const safe = collectFiles(root);
    assert.doesNotThrow(() => verifyArchive(forgedArchive(safe)));
    const built = packageDemo(root);
    assert.ok(built.bytes > 0);
    const attacks = [
      ['index.html','<script src="src/game.js"></script><object data="https://example.invalid/x"></object>'],
      ['assets/mark.svg','<svg><image href="https://example.invalid/x.png"/></svg>']
    ];
    for (const [name, payload] of attacks) {
      const forged = safe.map(file => file.name === name
        ? {...file,data:Buffer.from(payload)} : file);
      assert.throws(() => verifyArchive(forgedArchive(forged)),
        /invalid_demo_zip:(?:html_assets:index.html|asset_dependencies:assets\/mark.svg)/);
    }
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});
