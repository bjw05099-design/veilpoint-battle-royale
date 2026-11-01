'use strict';
// Decode bounded HTTP JSON as a complete UTF-8 byte stream. Converting each
// chunk to a string can corrupt a Korean name split across TCP chunks.
const {TextDecoder} = require('node:util');
function readJson(req, maxBytes = 2048, timeoutMs = 5000) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new RangeError('invalid_body_limit');
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) throw new RangeError('invalid_body_timeout');
  // Fail before buffering a declared oversized request. A stalled peer must not
  // keep a handler pending just because it never finishes uploading the body.
  const declared = req.headers?.['content-length'];
  if (declared !== undefined && Number(declared) > maxBytes) {
    if (typeof req.resume === 'function') req.resume();
    return Promise.reject(new RangeError('body_too_large'));
  }
  return new Promise((resolve, reject) => {
    const chunks = [];
    let bytes = 0, tooLarge = false, ended = false, settled = false;
    // An incomplete, under-limit upload must not hold the local two-client
    // server indefinitely. The deadline is wall-clock based, not 60Hz game time.
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      if (error) reject(error);
      else resolve(value);
    };
    const deadline = setTimeout(() => {
      finish(new RangeError('request_timeout'));
      if (typeof req.resume === 'function') req.resume();
    }, timeoutMs);
    req.on('data', chunk => {
      if (tooLarge) return;
      bytes += chunk.length;
      if (bytes > maxBytes) {
        tooLarge = true; chunks.length = 0;
        // Reject immediately, not only at 'end': a slow or abandoned upload
        // must not monopolize an unresolved HTTP request after crossing the cap.
        finish(new RangeError('body_too_large'));
        if (typeof req.resume === 'function') req.resume();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      ended = true;
      if (tooLarge || settled) return;
      try {
        const text = new TextDecoder('utf-8', {fatal: true}).decode(Buffer.concat(chunks, bytes));
        finish(null, JSON.parse(text));
      } catch {
        finish(new RangeError('invalid_json'));
      }
    });
    req.on('aborted', () => finish(new RangeError('request_aborted')));
    // An incomplete stream may close without emitting the deprecated 'aborted'
    // event. Settle its pending request instead of leaving a hung HTTP handler.
    req.on('close', () => {if (!ended) finish(new RangeError('request_aborted'));});
    req.on('error', error => finish(error));
  });
}
module.exports = {readJson};
