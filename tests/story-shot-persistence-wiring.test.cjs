'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

// Source integration gate: actual mouse/keyboard firing must use the same
// bounded checkpoint queue that the fixed-step loop drains.
const source=fs.readFileSync(path.join(__dirname,'../src/story-app.js'),'utf8');
test('CH01 successful PC shots use bounded persistence and immediate HUD refresh',()=>{
  const body=source.match(/function fire\(\)\s*\{([\s\S]*?)\n  \}\n  function reload\(/);
  assert.ok(body,'fire handler exists');
  assert.match(body[1],/Story\.fire\(state,input\.crouch\)/);
  assert.match(body[1],/if\(result\.ok\)\s*\{audio\.play\('shot'\);persistShot\(\);updateHud\(\);\}/);
  assert.doesNotMatch(body[1],/\bpersist\(\)/);
});
test('CH01 queued shot checkpoints flush on simulation tick and explicit pause',()=>{
  assert.match(source,/const SHOT_SAVE_INTERVAL_SECONDS=0\.45/);
  assert.match(source,/function persistShot\(\)[\s\S]*?shotSavePending=true/);
  assert.match(source,/if\(running&&shotSavePending&&state\.phase==='engagement'&&[\s\S]*?\)persist\(\)/);
  assert.match(source,/function menuOpen\(text\)[\s\S]*?if\(running&&state\.phase!=='complete'&&state\.phase!=='failed'\)persist\(\)/);
});

test('CH01 first finite PC shot persists immediately before any 450ms batch window',()=>{
  assert.match(source,/let firstShotSaved=false/);
  assert.match(source,/if\(\(state\.phase!=='engagement'\|\|!firstShotSaved\|\|/);
  assert.match(source,/firstShotSaved=true;\s*persist\(\)/);
  assert.match(source,/shotSavePending=false;firstShotSaved=false/);
});
