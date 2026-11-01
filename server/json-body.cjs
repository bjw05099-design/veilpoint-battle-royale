'use strict';
// Decode bounded HTTP JSON as a complete UTF-8 byte stream. Converting each
// chunk to a string can corrupt a Korean name split across TCP chunks.
const {TextDecoder} = require('node:util');
function readJson(req, maxBytes = 2048) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new RangeError('invalid_body_limit');
  // Fail before buffering a declared oversized request. A stalled peer must not
  // keep a handler pending just because it never finishes uploading the body.
  const declared = req.headers?.['content-length'];
  if (declared !== undefined && Number(declared) > maxBytes) {
    if (typeof req.resume === 'function') req.resume();
    return Promise.reject(new RangeError('body_too_large'));
  }
  return new Promise((resolve, reject) => {
    const chunks = [];
    let bytes = 0, tooLarge = false, ended = false;
    req.on('data', chunk => {
      if (tooLarge) return;
      bytes += chunk.length;
      if (bytes > maxBytes) {
        tooLarge = true; chunks.length = 0;
        // Reject immediately, not only at 'end': a slow or abandoned upload
        // must not monopolize an unresolved HTTP request after crossing the cap.
        reject(new RangeError('body_too_large'));
        return;
      }
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
