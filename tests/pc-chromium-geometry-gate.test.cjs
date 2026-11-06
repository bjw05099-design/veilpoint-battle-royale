'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const verifier=fs.readFileSync(path.resolve(__dirname,'../scripts/verify-pc-viewport.cjs'),'utf8');
const workflow=fs.readFileSync(path.resolve(__dirname,'../.github/workflows/ci.yml'),'utf8');
test('PC menu visibility is measured in actual browser geometry across four display profiles',()=>{
 assert.match(verifier,/2560,1440/);
 assert.match(verifier,/1366,768/);
 assert.match(verifier,/1280,720/);
 assert.match(verifier,/1024,600/);
 assert.match(verifier,/getBoundingClientRect\(\)/);
 assert.match(verifier,/scrollHeight>root\.clientHeight\+2/);
 assert.match(verifier,/scrollHeight>page\.clientHeight\+2/);
 assert.match(verifier,/data-vp-geometry/);
 assert.match(verifier,/cases\.length,7/);
});
test('PC release gate checks all BR modes and graphics settings, not only default screens',()=>{
 for(const name of ['main','more','load','export'])
  assert.ok(verifier.includes("'"+name+"'"),'BR screen missing: '+name);
 for(const id of ['graphicsVisualPage','graphicsControlsPage','graphicsBenchmarkPage'])
  assert.ok(verifier.includes(id),'graphics screen missing: '+id);
 assert.match(verifier,/throw new Error\('Viewport clipping found/);
 assert.match(verifier,/throw new Error\('Chrome\/Chromium unavailable/);
});
test('PC geometry runner is mandatory in CI and is shipped as evidence beside demo ZIP',()=>{
 assert.match(workflow,/node scripts\/verify-pc-viewport\.cjs --output dist\/pc-ui-geometry\.json/);
 assert.match(workflow,/dist\/pc-ui-geometry\.json/);
 assert.match(workflow,/veilpoint-offline-demo\.zip\.sha256/);
 assert.match(workflow,/dist\/ch01-route-evidence\.json/);
 const pkg=fs.readFileSync(path.resolve(__dirname,'../package.json'),'utf8');
 assert.match(pkg,/node --check scripts\/verify-pc-viewport\.cjs/);
});
