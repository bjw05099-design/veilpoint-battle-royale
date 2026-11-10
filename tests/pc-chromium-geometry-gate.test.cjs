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
 assert.match(verifier,/throw new Error\('Viewport geometry gate failed:/);
 assert.match(verifier,/transportFailure\?\[transportFailure\.message\]:\[\]/);
 assert.match(verifier,/if\(result\.failures\.length\)/);
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

test('real PC browser checks visible, enabled and unobstructed click targets on all seven pages',()=>{
 for(const id of ['play','newMatch','brViewMore','graphicsPauseOpen','brViewBack',
  'brImport','brExport','brImportFile','brImportApply','brExportDownload',
  'graphicsClose','graphicsTabVisual','graphicsTabControls',
  'graphicsTabBenchmark','graphicsPreset','desktopBindKey','benchmarkStart']){
  assert.ok(verifier.includes("'"+id+"'"),'required actionable target missing: '+id);
 }
 assert.match(verifier,/document\.elementFromPoint\(rect\.left\+rect\.width\*fx,/);
 assert.match(verifier,/node===top\|\|node\.contains\(top\)/);
 assert.match(verifier,/!root\.contains\(node\)/,
  'required target must belong to the visible active panel');
 assert.match(verifier,/required control outside active page, hidden, missing or disabled/);
 assert.match(verifier,/required button is covered or not clickable/);
 assert.match(verifier,/targets:\[\]/);
});

test('Windows EXE build refuses to ship without Chromium screen and click hit evidence',()=>{
 const win=fs.readFileSync(path.resolve(__dirname,
  '../.github/workflows/windows-demo-exe.yml'),'utf8');
 assert.match(win,/scripts\/verify-pc-viewport\.cjs/);
 assert.match(win,/Verify Win64 Chromium screen bounds and clickable controls/);
 assert.match(win,/Google Chrome is required for Win64 UI verification/);
 assert.match(win,/node scripts\/verify-pc-viewport\.cjs --output dist\/windows-exe\/pc-ui-geometry-win64\.json/);
 assert.match(win,/dist\/windows-exe\/pc-ui-geometry-win64\.json/);
 assert.match(win,/dist\/windows-exe\/veilpoint-windows-demo-exe\.zip\.sha256/);
 assert.match(win,/dist\/windows-exe\/ch01-route-evidence-win64\.json/);
});

test('Windows CDP startup probes a real loopback endpoint and never skips the geometry gate',()=>{
 assert.match(verifier,/process\.platform==='win32'/);
 assert.match(verifier,/server\.listen\(0,'127\.0\.0\.1',resolve\)/);
 assert.match(verifier,/windowsProbe\?await reserveLoopbackPort\(\):0/);
 assert.match(verifier,/\/json\/version/);
 assert.match(verifier,/version\.webSocketDebuggerUrl/);
 assert.match(verifier,/Chromium DevTools not ready/);
 assert.match(verifier,/throw new Error\('Viewport geometry gate failed:/);
});

test('Windows Chrome DevTools uses a reserved local HTTP endpoint without changing Linux geometry',async()=>{
 const {reserveLoopbackPort}=require('../scripts/verify-pc-viewport.cjs');
 const port=await reserveLoopbackPort();
 assert.ok(Number.isInteger(port)&&port>0&&port<=65535);
 assert.ok(verifier.includes("process.platform==='win32'"),'Windows-specific bootstrap missing');
 assert.ok(verifier.includes("'/json/version'")||verifier.includes("+'/json/version'"),
  'Windows Chrome HTTP readiness endpoint missing');
 assert.ok(verifier.includes("'DevToolsActivePort'"),'Linux port-file bootstrap must remain');
 assert.ok(verifier.includes('Page.setDocumentContent'),'DevTools must still measure real DOM');
 assert.ok(verifier.includes('Emulation.setDeviceMetricsOverride'),'all 4 viewports must be measured');
});

test('failed Windows Chrome startup preserves launch evidence and fails the release gate',()=>{
 for(const detail of ['pid=', 'exit=', 'signal=', 'HTTP readiness probe'])
  assert.ok(verifier.includes(detail),'startup diagnostic missing: '+detail);
 assert.ok(verifier.includes("transportFailure?[transportFailure.message]:[]"));
 assert.ok(verifier.includes("throw new Error('Viewport geometry gate failed:"));
});

test('Windows cold-renderer initialization remains a measured fail-closed CDP gate',()=>{
 const handshake=verifier.indexOf("const bootstrap=await rpc('Runtime.evaluate'");
 const injection=verifier.indexOf("await rpc('Page.setDocumentContent'");
 assert.ok(handshake>=0&&injection>handshake,'renderer handshake must precede real DOM injection');
 assert.ok(verifier.includes("method==='Page.setDocumentContent'"));
 assert.ok(verifier.includes('elapsedMs='));
 assert.ok(verifier.includes('browserPid='));
 assert.ok(verifier.includes('Chrome renderer did not respond before document injection'));
 assert.ok(verifier.includes("throw new Error('Viewport geometry gate failed:"));
});

test('unresponsive Windows Chrome can fall back only to a detected local Chromium binary',()=>{
 assert.ok(verifier.includes('msedge.exe'),'Windows Chromium alternative must be explicit');
 assert.ok(verifier.includes('fs.existsSync(candidate)'),'missing Edge must not be assumed installed');
 assert.ok(verifier.includes('activeChrome=edgeFallback'),'fallback must use the alternate executable');
 assert.ok(verifier.includes('child=spawn(activeChrome,'));
 assert.ok(verifier.includes('browser:path.basename(activeChrome)'),
  'geometry evidence must disclose the actual browser used');
 assert.ok(verifier.includes("throw new Error('Viewport geometry gate failed:"),
  'unavailable browsers cannot be counted as a passing geometry gate');
});

test('Graphics geometry uses tab activation rather than CSS-only screen exposure',()=>{
 // This source contract supplements, never replaces, Linux/Windows CDP.
 // Roving tabindex is active state: manual CSS toggles create false failures
 // and can hide genuine keyboard-accessibility problems.
 assert.match(verifier,/get\(tabId\)\.click\(\)/);
 assert.match(verifier,/get\(tabId\)\.tabIndex!==0/);
 assert.match(verifier,/get\(tabId\)\.getAttribute\('aria-selected'\)!=='true'/);
 assert.doesNotMatch(verifier,/for\(const other of \['graphicsVisualPage','graphicsControlsPage','graphicsBenchmarkPage'\]\)/);
});
