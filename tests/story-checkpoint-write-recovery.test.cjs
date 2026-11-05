'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../src/story-app.js'),'utf8');

test('CH01 failed checkpoint does not acknowledge save or clear dirty shot state',()=>{
  const persist=source.slice(source.indexOf('  function persist(reason='),source.indexOf('  function persistShot()'));
  assert.ok(persist.includes('const wrote=storage.set(SAVE_KEY,raw)'));
  assert.ok(persist.includes('saved=global.localStorage.getItem(SAVE_KEY)===raw'),
    'browser acknowledgement is not durability without matching readback');
  assert.match(persist,/let saved=false;/);
  assert.match(persist,/if\(saved\)\{\s*diskGeneration=raw;/);
  assert.match(persist,/if\(saved\)\{[\s\S]*?lastAutosaveAt=state\.world\.elapsed;\s*nextSaveRetryAt=0;\s*shotSavePending=false;/,
    'successful writes retain checkpoint boundaries despite replay metadata cleanup');
  assert.match(persist,/if\(pendingReplayReset\)\{[\s\S]*?storage\.remove\(PREVIEW_KEY\);[\s\S]*?storage\.remove\(BACKUP_KEY\);[\s\S]*?pendingReplayReset=false;/);
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
  assert.match(source,/if\(\(state\.phase!=='engagement'\|\|!firstShotSaved\|\|\s*state\.world\.elapsed-lastAutosaveAt>=SHOT_SAVE_INTERVAL_SECONDS\)\&\&\s*state\.world\.elapsed>=nextSaveRetryAt\)\{/,
    'first shot saves immediately and subsequent shots respect failed-write backoff');
  assert.match(source,/firstShotSaved=true;[\s\S]*?if\(!persist\(\)&&!memoryOnlyStory\)shotSavePending=true/,
    'first shot is queued as durably attempted before following held-fire events');
  assert.match(source,/VeilpointClock\.createClock\(\{hz:60/);
  assert.match(source,/Story\.step\(state,step,input\)/);
  assert.match(source,/const loaded=readCheckpoint\(\)/);
});
