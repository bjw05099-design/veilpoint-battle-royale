'use strict';
// Reproducible, zero-dependency ZIP of the browser-only VEILPOINT demo candidate.
// No Unreal, team server, third-party assets, hidden files or network downloads.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ROOT = path.resolve(__dirname, '..');
const PAGES = ['index.html', 'story.html'];
const DOCUMENTS = ['README.md', 'docs/DEMO_DELIVERY_GATES.md', 'docs/GRAPHICS_PROFILES.md'];
const checksum = data => crypto.createHash('sha256').update(data).digest('hex');
const crc32 = data => {
  let c = 0xffffffff;
  for (const b of data) {
    c ^= b;
    for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (c ^ 0xffffffff) >>> 0;
};
function collectFiles(root = ROOT) {
  const files = new Set([...PAGES, ...DOCUMENTS]);
  for (const page of PAGES) {
    const html = fs.readFileSync(path.join(root, page), 'utf8');
    const refs = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)].map(m => m[1]);
    if (!refs.length) throw new Error(`Missing browser scripts in ${page}`);
    for (const ref of refs) {
      if (!/^src\/[a-z0-9-]+\.js$/i.test(ref)) throw new Error(`Unsafe/external script in ${page}: ${ref}`);
      files.add(ref);
    }
  }
  return [...files].sort().map(name => {
    const full = path.join(root, name);
    const stat = fs.lstatSync(full);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 2 * 1024 * 1024)
      throw new Error(`Invalid demo source file: ${name}`);
    return {name, data: fs.readFileSync(full)};
  });
}
function buildZip(entries) {
  const locals = [], central = [];
  let offset = 0;
  for (const {name, data} of entries) {
    const filename = Buffer.from(name, 'utf8');
    if (filename.length > 65535 || data.length > 0xffffffff) throw new RangeError('ZIP entry too large');
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8; stored, not compressed.
    local.writeUInt32LE(crc, 14);local.writeUInt32LE(data.length, 18);local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(filename.length, 26);
    locals.push(local, filename, data);
    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50, 0);directory.writeUInt16LE(20, 4);
    directory.writeUInt16LE(20, 6);directory.writeUInt16LE(0x0800, 8);
    directory.writeUInt32LE(crc, 16);directory.writeUInt32LE(data.length, 20);directory.writeUInt32LE(data.length, 24);
    directory.writeUInt16LE(filename.length, 28);directory.writeUInt32LE(offset, 42);
    central.push(directory, filename);
    offset += local.length + filename.length + data.length;
  }
  const directorySize = central.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);end.writeUInt32LE(directorySize, 12);end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...central, end]);
}
function packageDemo(root = ROOT, output = path.join(root, 'dist', 'veilpoint-offline-demo.zip')) {
  const files = collectFiles(root);
  const manifest = files.map(f => `${checksum(f.data)}  ${f.name}`).join('\n') + '\n';
  const notice = 'VEILPOINT browser offline prototype candidate. Source license: UNLICENSED.\n' +
    'No Unreal executable, online multiplayer, licensed production assets, 165FPS or real-browser QA is claimed.\n';
  const entries = [...files, {name: 'MANIFEST.sha256', data: Buffer.from(manifest)},
    {name: 'NOTICE.txt', data: Buffer.from(notice)}].sort((a,b) => a.name.localeCompare(b.name, 'en'));
  const zip = buildZip(entries);
  fs.mkdirSync(path.dirname(output), {recursive: true});
  fs.writeFileSync(output, zip);
  fs.writeFileSync(output + '.sha256', `${checksum(zip)}  ${path.basename(output)}\n`);
  return {output, files: entries.length, bytes: zip.length, sha256: checksum(zip)};
}
if (require.main === module) console.log(JSON.stringify(packageDemo(), null, 2));
module.exports = {collectFiles, buildZip, packageDemo, crc32};
