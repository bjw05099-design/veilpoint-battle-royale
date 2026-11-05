'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../src/story-app.js'),'utf8');

test('CH01 failed checkpoint does not acknowledge save or clear dirty shot state',()=>{
  const persist=source.slice(source.indexOf('  function persist(reason='),source.indexOf('  function persistShot()'));
  assert.match(persist,/const saved=storage\.set\(SAVE_KEY,raw\)/);
  assert.match(persist,/if\(saved\)\{\s*diskGeneration=raw;\s*lastAutosaveAt=state\.world\.elapsed;\s*nextSaveRetryAt=0;\s*shotSavePending=false;/);
  assert.match(persist,/else\{[\s\S]*?nextSaveRetryAt=state\.world\.elapsed\+1;/);
  assert.match(persist,/saveFailed=!saved/);
  assert.match(persist,/checkpoint=raw/,'memory fallback remains available without localStorage');
  assert.match(persist,/notice\.classList\.toggle\('hidden',saved&&!reason\)/);
});

test('CH01 quiet traversal retries failed writes on simulated time, never every rendered frame',()=>{
  assert.match(source,/let lastAutosaveAt=0,shotSavePending=false,nextSaveRetryAt=0/);
  assert.match(source,/state\.world\.elapsed-lastAutosaveAt>=AUTOSAVE_SECONDS&&\s*state\.world\.elapsed>=nextSaveRetryAt\)persist\(\)/);
  assert.match(source,/const AUTOSAVE_SECONDS=5/);
  assert.match(source,/state\.world\.elapsed-lastAutosaveAt>=SHOT_SAVE_INTERVAL_SECONDS&&\s*state\.world\.elapsed>=nextSaveRetryAt\)persist\(\)/,
    'held-fire flush respects failed-write backoff');
  assert.match(source,/if\(\(state\.phase!=='engagement'\|\|state\.world\.elapsed-lastAutosaveAt>=SHOT_SAVE_INTERVAL_SECONDS\)&&\s*state\.world\.elapsed>=nextSaveRetryAt\)/,
    'finite combat saves respect the same backoff');
  assert.match(source,/VeilpointClock\.createClock\(\{hz:60/);
  assert.match(source,/Story\.step\(state,step,input\)/);
  assert.match(source,/const loaded=readCheckpoint\(\)/);
});
