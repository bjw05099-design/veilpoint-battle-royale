'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

test('Chromium viewport gate uses an explicit HTTP CDP readiness probe on all platforms',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../scripts/verify-pc-viewport.cjs'),'utf8');
 assert.match(source,/const windowsProbe=true;/);
 assert.match(source,/const port=windowsProbe\?await reserveLoopbackPort\(\):0;/);
 assert.match(source,/fetch\('http:\/\/127\.0\.0\.1:'\+port\+'\/json\/version'/);
 assert.match(source,/if\(version\.webSocketDebuggerUrl\)return port;/);
 assert.match(source,/throw new Error\('Chromium DevTools not ready/);
 assert.match(source,/completedViewports/);
});
