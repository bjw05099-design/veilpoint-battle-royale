'use strict';
// Reproducible, zero-dependency ZIP of the browser-only VEILPOINT demo candidate.
// No Unreal, team server, third-party assets, hidden files or network downloads.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const ROOT = path.resolve(__dirname, '..');
const PAGES = ['index.html', 'story.html', 'terrain.html'];
const DOCUMENTS = ['README.md', 'docs/DEMO_DELIVERY_GATES.md', 'docs/GRAPHICS_PROFILES.md'];
const NOTICE_TEXT = "VEILPOINT browser offline prototype candidate. Source license: UNLICENSED.\nNo Unreal executable, online multiplayer, licensed production assets, 165FPS or real-browser QA is claimed.\n";
const QUICK_START_TEXT = "VEILPOINT BROWSER OFFLINE DEMO — START HERE (Windows PC)\n\n1. If downloaded from GitHub Actions, extract the outer artifact ZIP first.\n   Inside it, locate veilpoint-offline-demo.zip and the companion .sha256 checksum.\n2. Extract veilpoint-offline-demo.zip into a NEW folder.\n   Do not run the ZIP itself or look for Veilpoint.exe: this is a browser demo.\n3. Double-click index.html in Windows Edge or Chrome to start Battle Royale.\n   Use Story CH01 on the main menu, or open story.html directly.\n   Optional: open terrain.html for the standalone 1:1 metre terrain tile lab.\n   It uses ORIGINAL TEST ART, not authentic Aden height/building data.\n4. Mouse + keyboard: ESC opens pause; G opens graphics and PC key settings.\n   Closing settings does not resume the current match; press Continue explicitly.\n5. Optional 120-second BR benchmark: open graphics settings, choose Measurement\n   Ready, return to the game, and play until the measurement ends.\n   Export the result JSON; if a browser blocks the download, choose\n   JSON Direct View/Copy and use Ctrl+C to copy into a .json file.\n\nIMPORTANT:\n- Browser saves belong to the current browser/file origin. Clearing site storage\n  or moving files to another origin may make earlier checkpoints unavailable.\n- Some file:// environments restrict storage or WebGL; use a current desktop\n  browser. A local HTTP development server is optional, never mandatory.\n- This archive contains NO native Unreal/Win64 .exe, licensed production assets\n  or verified public Internet multiplayer.\n- A QHD 165Hz display and owner-reported RTX 3070 do not prove 165 FPS.\n- The demo and benchmark do not upload measurements to a remote server.\n\nTo check integrity, compare veilpoint-offline-demo.zip.sha256 against the inner\nunmodified ZIP. MANIFEST.sha256 covers browser files and QUICK_START.txt.\n";
const checksum = data => crypto.createHash('sha256').update(data).digest('hex');
const crc32 = data => {
  let c = 0xffffffff;
  for (const b of data) {
    c ^= b;
    for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (c ^ 0xffffffff) >>> 0;
};
// One dependency policy for both packaging and independent archive verification.
// A manifest can be internally consistent while omitting a required browser script.
function referencedAssets(page, html) {
  if (!/<script\b[^>]*\bsrc=["'][^"']+["']/i.test(html))
    throw new Error('Missing browser scripts in ' + page);
  // Browsers load unquoted src/href/poster/srcset values, but the allowlist
  // below intentionally parses quoted values only. Fail closed instead of
  // silently omitting a browser-visible asset from the offline ZIP.
  if (/(?:^|[\s<])(?:src|href|poster|srcset)\s*=\s*[^"'\s>]/i.test(html))
    throw new Error('Unquoted offline asset in ' + page);

  // These browser features can load a network resource or submit data without
  // using the src/href/poster allowlist. A static offline candidate must not
  // silently certify active embeds, inline frame documents or form endpoints.
  if (/<\s*(?:object|embed|iframe|form|base)\b|\bsrcdoc\s*=|\bformaction\s*=/i.test(html))
    throw new Error('Unsupported active HTML dependency in ' + page);
  if (/@import\b|\burl\s*\(|(?:-webkit-)?image-set\s*\(/i.test(html))
    throw new Error('Unsupported CSS import/url in ' + page);
  // A locally referenced script is not enough for an offline certificate if
  // the page itself runs inline code, inline event handlers or redirects.
  // These pages intentionally use only reviewed, bundled external scripts.
  if (/<script\b(?![^>]*\bsrc\s*=)[^>]*>/i.test(html) ||
      /\s+on[a-z]+\s*=/i.test(html) ||
      /<meta\b[^>]*\bhttp-equiv\s*=\s*(?:"refresh"|'refresh'|refresh\b)/i.test(html))
    throw new Error('Unsupported inline script/redirect in ' + page);
  const refs = [...html.matchAll(/\b(src|href|poster|srcset)\s*=\s*(["'])(.*?)\2/gi)]
    .map(match => ({attribute: match[1].toLowerCase(), ref: match[3]}));
  return refs.filter(({attribute, ref}) => {
    // Navigation links can target another bundled page or a local anchor.
    // An HTML page is not a JavaScript, image, poster or srcset asset; treating
    // <script src="story.html"> as a navigation link falsely certifies launch.
    if (ref.startsWith('#') || PAGES.includes(ref)) {
      if (attribute !== 'href')
        throw new Error('Unsafe/external asset in ' + page + ': ' + ref);
      return false;
    }
    // Reject network URLs, path traversal, queries and unsupported srcset lists.
    if (!/^(?:src|assets)\/(?:[a-z0-9_-]+\/)*[a-z0-9_-]+\.(?:js|css|png|jpe?g|webp|svg|ogg|wav)$/i.test(ref))
      throw new Error('Unsafe/external asset in ' + page + ': ' + ref);
    return true;
  }).map(({ref}) => ref);
}
// CSS is loaded by the browser after the HTML parser. Without auditing it,
// a ZIP can appear self-contained while silently fetching a remote font/image.
// Keep this release candidate strict until a recursive local CSS bundler exists.
function assertLocalAssetContent(name, data) {
  const source = data.toString('utf8');
  if (name.toLowerCase().endsWith('.css') &&
      /@import\b|\burl\s*\(|(?:-webkit-)?image-set\s*\(/i.test(source))
    throw new Error('Unsupported CSS dependency in ' + name);
  // SVG is XML and can embed scripts, frames, external images/styles or
  // entity declarations. As a static <img> it is usually restricted, but the
  // offline package must not rely on browser-specific SVG resource policy.
  // Permit only self-contained vector shapes until SVG references are bundled
  // and audited recursively; ordinary xmlns declarations remain valid.
  if (name.toLowerCase().endsWith('.svg') &&
      (/<\s*(?:script|foreignobject|iframe|object|embed|image|use|feimage)\b/i.test(source) ||
       /\b(?:href|src|srcdoc|xml:base)\s*=|\bon[a-z]+\s*=/i.test(source) ||
       /@import\b|\burl\s*\(|(?:-webkit-)?image-set\s*\(/i.test(source) ||
       /<!\s*(?:DOCTYPE|ENTITY)\b|<\?xml-stylesheet\b/i.test(source)))
    throw new Error('Unsupported SVG dependency in ' + name);
  // An offline ZIP can have valid hashes yet load external code at runtime.
  // Classic browser demo scripts have no dynamic network/worker/module
  // dependency: reject those constructs until they are explicitly bundled
  // and verified. This is a conservative source audit, not a browser proof.
  // The import keyword needs a trailing word boundary: otherwise innocent
  // offline identifiers such as imported, importer or importReady block ZIP
  // packaging despite containing no module load. Actual import() and
  // import {...} statements remain forbidden by this conservative policy.
  if (name.toLowerCase().endsWith('.js') &&
      (/\b(?:fetch|importScripts|WebSocket|EventSource|XMLHttpRequest|Worker|SharedWorker|sendBeacon)\s*\(/.test(source) ||
       /\bimport\b\s*(?:\(|\{|["'*]|[A-Za-z_$])/.test(source) ||
       /\bserviceWorker\s*\.\s*register\s*\(/.test(source) ||
       /["'`]\s*(?:https?:\/\/|wss?:\/\/|\/\/)/i.test(source)))
    throw new Error('Unsupported JavaScript dependency in ' + name);
}
function collectFiles(root = ROOT) {
  const realRoot = fs.realpathSync(root);
  const files = new Set([...PAGES, ...DOCUMENTS]);
  for (const page of PAGES) {
    const html = fs.readFileSync(path.join(root, page), 'utf8');
    for (const ref of referencedAssets(page, html)) files.add(ref);
  }
  return [...files].sort().map(name => {
    const full = path.join(root, name);
    // lstat() alone cannot see a symlink in a parent directory. A crafted
    // assets/ link could otherwise package a file outside the project root.
    const relative = path.relative(realRoot, fs.realpathSync(full));
    if (relative === '..' || relative.startsWith('..' + path.sep) ||
        path.isAbsolute(relative))
      throw new Error('Invalid demo source file: ' + name);
    const stat = fs.lstatSync(full);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 2 * 1024 * 1024)
      throw new Error(`Invalid demo source file: ${name}`);
    const data = fs.readFileSync(full);
    assertLocalAssetContent(name, data);
    return {name, data};
  });
}
function buildZip(entries, {compress = true} = {}) {
  const locals = [], central = [];
  let offset = 0;
  for (const {name, data} of entries) {
    const filename = Buffer.from(name, 'utf8');
    if (filename.length > 65535 || data.length > 0xffffffff) throw new RangeError('ZIP entry too large');
    const crc = crc32(data);
    // ZIP method 8 (raw DEFLATE) is lossless and supported by standard extractors.
    // Keep already-compressed assets stored when DEFLATE would make them larger.
    const candidate = compress ? zlib.deflateRawSync(data, {level: 9}) : data;
    const payload = candidate.length < data.length ? candidate : data;
    const method = payload === data ? 0 : 8;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8, no data descriptor.
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(crc, 14);local.writeUInt32LE(payload.length, 18);local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(filename.length, 26);
    locals.push(local, filename, payload);
    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50, 0);directory.writeUInt16LE(20, 4);
    directory.writeUInt16LE(20, 6);directory.writeUInt16LE(0x0800, 8);
    directory.writeUInt16LE(method, 10);
    directory.writeUInt32LE(crc, 16);directory.writeUInt32LE(payload.length, 20);directory.writeUInt32LE(data.length, 24);
    directory.writeUInt16LE(filename.length, 28);directory.writeUInt32LE(offset, 42);
    central.push(directory, filename);
    offset += local.length + filename.length + payload.length;
  }
  const directorySize = central.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);end.writeUInt32LE(directorySize, 12);end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...central, end]);
}
function packageDemo(root = ROOT, output = path.join(root, 'dist', 'veilpoint-offline-demo.zip')) {
  const files = collectFiles(root);
  // Windows launch instructions are included in the same SHA256 manifest as
  // all browser-visible source files. No executable or Internet access needed.
  const quickStart = {name: 'QUICK_START.txt', data: Buffer.from(QUICK_START_TEXT)};
  const manifest = [...files, quickStart]
    .sort((a,b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
    .map(f => `${checksum(f.data)}  ${f.name}`).join('\n') + '\n';
  const entries = [...files, quickStart, {name:'MANIFEST.sha256', data:Buffer.from(manifest)},
    {name:'NOTICE.txt', data:Buffer.from(NOTICE_TEXT)}]
    .sort((a,b) => a.name.localeCompare(b.name, 'en'));
  const zip = buildZip(entries);
  const storedBaselineBytes = buildZip(entries, {compress: false}).length;
  const sourceBytes = entries.reduce((sum, entry) => sum + entry.data.length, 0);
  const largestSources = [...entries].sort((a, b) => b.data.length - a.data.length)
    .slice(0, 5).map(entry => ({name: entry.name, bytes: entry.data.length}));
  // Diagnose byte-identical source paths without removing filenames required
  // by browser navigation. A shared script referenced by both pages is already
  // included only once by collectFiles().
  const byDigest = new Map();
  for(const {name,data} of files){
    const hash=checksum(data);
    if(!byDigest.has(hash))byDigest.set(hash,{files:[],bytesEach:data.length});
    byDigest.get(hash).files.push(name);
  }
  const duplicateSources=[...byDigest.values()].filter(g=>g.files.length>1)
    .map(g=>({...g,redundantBytes:(g.files.length-1)*g.bytesEach}));
  const duplicateContentBytes=duplicateSources.reduce((sum,g)=>sum+g.redundantBytes,0);
  // Exact byte arithmetic, not observed filesystem free space: block size,
  // temporary extraction files and actual update strategy are environment-specific.
  const downloadAndExtractBytes=zip.length+sourceBytes;
  const twoArchiveStagingBytes=2*zip.length+sourceBytes;
  fs.mkdirSync(path.dirname(output), {recursive: true});
  fs.writeFileSync(output, zip);
  fs.writeFileSync(output + '.sha256', `${checksum(zip)}  ${path.basename(output)}\n`);
  // GitHub Actions wraps uploaded artifacts in a second ZIP. Ship this guide
  // alongside the inner game ZIP so first-time Windows users can read it
  // immediately after opening the Actions download, without opening both ZIPs.
  // It must be byte-identical to the manifest-verified inner QUICK_START.txt.
  const outerGuide = path.join(path.dirname(output), 'START_HERE.txt');
  fs.writeFileSync(outerGuide, QUICK_START_TEXT, 'utf8');
  return {output, outerGuide, files: entries.length, bytes: zip.length, sourceBytes,
    storedBaselineBytes, savedBytes: storedBaselineBytes - zip.length,
    largestSources, duplicateSources, duplicateContentBytes,
    downloadAndExtractBytes, twoArchiveStagingBytes, sha256: checksum(zip)};
}
if (require.main === module) console.log(JSON.stringify(packageDemo(), null, 2));
module.exports = {collectFiles, referencedAssets, assertLocalAssetContent, buildZip, packageDemo, crc32, NOTICE_TEXT, QUICK_START_TEXT};
