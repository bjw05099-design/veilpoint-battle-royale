'use strict';
// Independent verification of the offline demo's stored ZIP entries.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {crc32} = require('./package-offline-demo.cjs');
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function invalid(reason) {throw new Error('invalid_demo_zip:' + reason);}
function inspectZip(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 22) invalid('truncated');
  const end = bytes.length - 22;
  if (bytes.readUInt32LE(end) !== 0x06054b50 || bytes.readUInt16LE(end + 20) !== 0)
    invalid('end_record');
  const count = bytes.readUInt16LE(end + 10);
  if (count === 0 || count !== bytes.readUInt16LE(end + 8) ||
      bytes.readUInt16LE(end + 4) !== 0 || bytes.readUInt16LE(end + 6) !== 0)
    invalid('entry_count');
  const offset = bytes.readUInt32LE(end + 16);
  if (offset + bytes.readUInt32LE(end + 12) !== end) invalid('directory_bounds');
  let cursor = offset;
  const entries = new Map();
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > end || bytes.readUInt32LE(cursor) !== 0x02014b50)
      invalid('directory_entry');
    const flags = bytes.readUInt16LE(cursor + 8);
    const method = bytes.readUInt16LE(cursor + 10);
    const crc = bytes.readUInt32LE(cursor + 16);
    const size = bytes.readUInt32LE(cursor + 24);
    const nameLength = bytes.readUInt16LE(cursor + 28);
    const extraLength = bytes.readUInt16LE(cursor + 30);
    const commentLength = bytes.readUInt16LE(cursor + 32);
    const next = cursor + 46 + nameLength + extraLength + commentLength;
    if (next > end || flags !== 0x0800 || method !== 0 ||
        size !== bytes.readUInt32LE(cursor + 20)) invalid('entry_header');
    const name = bytes.toString('utf8', cursor + 46, cursor + 46 + nameLength);
    if (!/^[a-z0-9_-]+(?:\/[a-z0-9_-]+)*\.[a-z0-9]+$/i.test(name) ||
        entries.has(name)) invalid('entry_name');
    const local = bytes.readUInt32LE(cursor + 42);
    if (local + 30 > offset || bytes.readUInt32LE(local) !== 0x04034b50)
      invalid('local_header');
    if (bytes.readUInt16LE(local + 6) !== flags ||
        bytes.readUInt16LE(local + 8) !== method ||
        bytes.readUInt32LE(local + 14) !== crc ||
        bytes.readUInt32LE(local + 18) !== size ||
        bytes.readUInt32LE(local + 22) !== size) invalid('local_metadata');
    const localNameLength = bytes.readUInt16LE(local + 26);
    const dataStart = local + 30 + localNameLength + bytes.readUInt16LE(local + 28);
    if (dataStart + size > offset ||
        bytes.toString('utf8', local + 30, local + 30 + localNameLength) !== name)
      invalid('local_bounds');
    const content = bytes.subarray(dataStart, dataStart + size);
    if (crc32(content) !== crc) invalid('crc:' + name);
    entries.set(name, content);
    cursor = next;
  }
  if (cursor !== end) invalid('directory_length');
  return entries;
}
function verifyArchive(bytes) {
  const entries = inspectZip(bytes);
  if (!entries.has('MANIFEST.sha256') || !entries.has('NOTICE.txt') ||
      !entries.has('index.html') || !entries.has('story.html'))
    invalid('required_files');
  // The packager writes its manifest in code-point order, while ZIP entries
  // use locale-aware sorting; compare against the original manifest contract.
  const expected = [...entries].filter(([name]) =>
    name !== 'MANIFEST.sha256' && name !== 'NOTICE.txt')
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([name, data]) => sha256(data) + '  ' + name).join('\n') + '\n';
  if (entries.get('MANIFEST.sha256').toString('utf8') !== expected)
    invalid('manifest');
  return {sha256: sha256(bytes), files: entries.size};
}
function verifyPackage(filename = path.resolve(__dirname, '..', 'dist', 'veilpoint-offline-demo.zip')) {
  const bytes = fs.readFileSync(filename);
  const result = verifyArchive(bytes);
  const sidecar = fs.readFileSync(filename + '.sha256', 'utf8');
  if (sidecar !== result.sha256 + '  ' + path.basename(filename) + '\n')
    invalid('sidecar');
  return result;
}
if (require.main === module) console.log(JSON.stringify(verifyPackage(), null, 2));
module.exports = {inspectZip, verifyArchive, verifyPackage};
