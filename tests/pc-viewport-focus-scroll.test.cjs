'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const script=fs.readFileSync(path.join(__dirname,'../scripts/verify-pc-viewport.cjs'),'utf8');

test('real Chromium geometry gate checks document overflow and keyboard focus',()=>{
 assert.match(script,/doc\.scrollHeight>innerHeight\+2/);
 assert.match(script,/doc\.scrollWidth>innerWidth\+2/);
 assert.match(script,/node\.focus\(\{preventScroll:true\}\)/);
 assert.match(script,/document\.activeElement===node/);
 assert.match(script,/required control cannot receive keyboard focus/);
});

test('real viewport evidence remains strict for seven screens at four resolutions',()=>{
 assert.match(script,/\[\[2560,1440\],\[1366,768\],\[1280,720\],\[1024,600\]\]/);
 assert.match(script,/data\.cases\.length,7/);
 assert.match(script,/throw new Error\('Viewport clipping found:/);
 assert.match(script,/Emulation\.setDeviceMetricsOverride/);
});
