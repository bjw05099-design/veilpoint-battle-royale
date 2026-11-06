'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const os=require('node:os');

test('viewport gate writes actionable evidence and fails closed when Chrome cannot launch',()=>{
 const root=path.resolve(__dirname,'..');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'vp-cdp-fail-'));
 const chrome=path.join(dir,'non-executable-chrome');
 const output=path.join(dir,'geometry.json');
 try{
  fs.writeFileSync(chrome,'#!/bin/sh\necho simulated-browser-failure >&2\nexit 17\n');\n  fs.chmodSync(chrome,0o755);
  const run=spawnSync(process.execPath,['scripts/verify-pc-viewport.cjs','--output',output],{
   cwd:root,env:{...process.env,CHROME_BIN:chrome},encoding:'utf8',timeout:20000
  });
  assert.notEqual(run.status,0,'launch failure must never be marked as passing');
  assert.equal(run.error,undefined,'gate should terminate without hanging');
  assert.ok(fs.existsSync(output),'partial failure artifact must be retained');
  const report=JSON.parse(fs.readFileSync(output,'utf8'));
  assert.equal(report.checks.length,0);
  assert.ok(report.transportFailure?.message);
  assert.ok(report.failures.length>0);
  assert.equal(report.transportFailure.completedViewports,0);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
