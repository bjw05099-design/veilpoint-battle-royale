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
    assert.equal(first.files, 9); // two pages, shared script, three docs, quick-start, manifest, notice
    assert.ok(first.storedBaselineBytes >= first.bytes);
    assert.equal(first.savedBytes, first.storedBaselineBytes - first.bytes);
    assert.ok(first.sourceBytes > 0);
    assert.ok(first.largestSources.length > 0);
    assert.equal(first.downloadAndExtractBytes,first.bytes+first.sourceBytes);
    assert.equal(first.twoArchiveStagingBytes,2*first.bytes+first.sourceBytes);
    assert.equal(first.duplicateContentBytes,
      first.duplicateSources.reduce((sum,g)=>sum+g.redundantBytes,0));
    assert.ok(first.duplicateSources.some(g=>g.files.includes('index.html')&&
      g.files.includes('story.html')),'identical page paths are reported but retained');
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
      '<style>body{background:url(https://example.com/a.png)}</style>',
      '<style>body{background:image-set("https://example.com/a.png" 1x)}</style>'
    ]) {
      fs.writeFileSync(path.join(dir, 'index.html'),
        '<script src="src/game.js"></script>' + unsafe);
      assert.throws(() => collectFiles(dir), /Unsafe\/external asset|Unsupported CSS import\/url/);
    }
  } finally {fs.rmSync(dir, {recursive:true, force:true});}
});

test('unquoted HTML assets fail closed instead of silently disappearing from the offline ZIP', () => {
  const dir = fixture();
  try {
    for (const unsafe of [
      '<img src=assets/sign.webp>',
      '<a href=story.html>Story</a>',
      '<video poster=assets/poster.webp></video>',
      '<img srcset=assets/sign.webp>'
    ]) {
      fs.writeFileSync(path.join(dir, 'index.html'), '<script src="src/game.js"></script>' + unsafe);
      assert.throws(() => collectFiles(dir), /Unquoted offline asset/);
    }
    fs.writeFileSync(path.join(dir, 'index.html'),
      '<script src="src/game.js"></script><img data-src=assets/sign.webp>');
    assert.doesNotThrow(() => collectFiles(dir), 'data attributes are not browser-loaded assets');
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

test('offline CSS dependencies fail closed instead of making hidden network requests', () => {
  const dir = fixture();
  try {
    fs.writeFileSync(path.join(dir, 'index.html'),
      '<script src="src/game.js"></script><link rel="stylesheet" href="src/theme.css">');
    const stylesheet = path.join(dir, 'src/theme.css');
    fs.writeFileSync(stylesheet, 'body { color: white; }');
    assert.ok(collectFiles(dir).some(file => file.name === 'src/theme.css'));
    for (const css of [
      '@import "https://example.com/tracker.css";',
      'body { background: url(https://example.com/track.png); }',
      'body { background-image: image-set("https://example.com/x.png" 1x); }',
      'body { background-image: -webkit-image-set("https://example.com/x.png" 1x); }'
    ]) {
      fs.writeFileSync(stylesheet, css);
      assert.throws(() => collectFiles(dir), /Unsupported CSS dependency/);
    }
  } finally {fs.rmSync(dir, {recursive: true, force: true});}
});

test('offline package cannot follow an asset-directory symlink outside its source root', () => {
  const dir = fixture();
  const external = fs.mkdtempSync(path.join(os.tmpdir(), 'veilpoint-external-'));
  try {
    fs.writeFileSync(path.join(external, 'secret.js'), 'private fixture data');
    fs.symlinkSync(external, path.join(dir, 'assets'), process.platform === 'win32' ? 'junction' : 'dir');
    fs.writeFileSync(path.join(dir, 'index.html'),
      '<script src="src/game.js"></script><script src="assets/secret.js"></script>');
    assert.throws(() => collectFiles(dir), /Invalid demo source file/);
  } finally {
    fs.rmSync(dir, {recursive: true, force: true});
    fs.rmSync(external, {recursive: true, force: true});
  }
});

test('offline packager rejects hidden JavaScript network/module dependencies', () => {
  const dir = fixture();
  try {
    const script = path.join(dir, 'src/game.js');
    for (const code of [
      'fetch("https://cdn.example.invalid/runtime.js");',
      'import("https://cdn.example.invalid/scene.js");',
      'import {scene} from "./missing-scene.js";',
      'new Worker("https://cdn.example.invalid/worker.js");',
      'new WebSocket("wss://example.invalid/socket");',
      'navigator.serviceWorker.register("/offline-worker.js");',
      'navigator.sendBeacon("https://example.invalid/metric", "x");',
      'const image = new Image(); image.src = "https://example.invalid/pixel.png";',
      'window.location.href = "https://example.invalid/redirect";',
      'const icon = "//example.invalid/icon.png";'
    ]) {
      fs.writeFileSync(script, code);
      assert.throws(() => collectFiles(dir), /Unsupported JavaScript dependency/,
        'network-dependent source must not receive an offline certificate: ' + code);
    }
    fs.writeFileSync(script, 'const world = {name: "VEILPOINT"}; console.log(world.name);');
    assert.doesNotThrow(() => collectFiles(dir), 'self-contained browser code remains packagable');
  } finally {fs.rmSync(dir, {recursive: true, force: true});}
});

test('offline HTML cannot hide an inline network script, event handler or redirect', () => {
  const dir = fixture();
  try {
    for (const unsafe of [
      '<script>fetch("https://example.invalid/scene")</script>',
      '<img src="assets/local.png" onerror="fetch(\'https://example.invalid/x\')">',
      '<meta http-equiv="refresh" content="0;url=https://example.invalid/">',
      "<meta content='0;url=https://example.invalid/' http-equiv='refresh'>"
    ]) {
      fs.writeFileSync(path.join(dir, 'index.html'),
        '<script src="src/game.js"></script>' + unsafe);
      assert.throws(() => collectFiles(dir), /Unsupported inline script\/redirect/,
        'inline network execution/redirect must fail closed');
    }
    fs.writeFileSync(path.join(dir, 'index.html'),
      '<script src="src/game.js"></script><a href="story.html">Story</a>');
    assert.doesNotThrow(() => collectFiles(dir));
  } finally {fs.rmSync(dir, {recursive: true, force: true});}
});

test('offline scanner accepts ordinary import-prefixed identifiers but still refuses actual module loading',()=>{
 const dir=fixture(),script=path.join(dir,'src/game.js');
 try{
  for(const selfContained of [
   'const imported = 1; const importer = () => imported; console.log(importer());',
   'const importReady = true; const imports = []; if(importReady) imports.push(1);',
   'function importFallback(){return 2;} console.log(importFallback());'
  ]){
   fs.writeFileSync(script,selfContained);
   assert.doesNotThrow(()=>collectFiles(dir),
     'an identifier beginning with import is not JavaScript module syntax');
   const packageInfo=packageDemo(dir);
   assert.ok(packageInfo.bytes>0);
  }
  for(const unsafe of [
   'import("./remote-module.js")',
   'import {game} from "./remote-module.js";',
   'const game = import( "./remote-module.js" );',
   'import Game from "./remote-module.js";'
  ]){
   fs.writeFileSync(script,unsafe);
   assert.throws(()=>collectFiles(dir),/Unsupported JavaScript dependency/,
     'actual dynamic/static module loads remain prohibited');
  }
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
