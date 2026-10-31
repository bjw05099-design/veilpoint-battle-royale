'use strict';
// Decode bounded HTTP JSON as a complete UTF-8 byte stream. Converting each
// chunk to a string can corrupt a Korean name split across TCP chunks.
const {TextDecoder} = require('node:util');
function readJson(req, maxBytes = 2048) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new RangeError('invalid_body_limit');
  return new Promise((resolve, reject) => {
    const chunks = [];
    let bytes = 0, tooLarge = false, ended = false;
    req.on('data', chunk => {
      if (tooLarge) return;
      bytes += chunk.length;
      if (bytes > maxBytes) {tooLarge = true; chunks.length = 0; return;}
      chunks.push(chunk);
    });
    req.on('end', () => {
      ended = true;
      if (tooLarge) return reject(new RangeError('body_too_large'));
      try {
        const text = new TextDecoder('utf-8', {fatal: true}).decode(Buffer.concat(chunks, bytes));
        resolve(JSON.parse(text));
      } catch {
        reject(new RangeError('invalid_json'));
      }
    });
    req.on('aborted', () => reject(new RangeError('request_aborted')));
    // An incomplete stream may close without emitting the deprecated 'aborted'
    // event. Settle its pending request instead of leaving a hung HTTP handler.
    req.on('close', () => {if (!ended) reject(new RangeError('request_aborted'));});
    req.on('error', reject);
  });
}
module.exports = {readJson};
