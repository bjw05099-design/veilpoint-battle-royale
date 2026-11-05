'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const app=fs.readFileSync(path.join(__dirname,'../src/app.js'),'utf8');
const persist=app.slice(app.indexOf('function persistMatch(){'),app.indexOf('// A temporary privacy/storage read exception'));
test('BR checks exact previous generation in backup before replacing primary',()=>{
 const rotate=persist.indexOf('global.localStorage.setItem(MATCH_BACKUP_KEY,previous)');
 const backup=persist.indexOf('const verifiedBackup=global.localStorage.getItem(MATCH_BACKUP_KEY)');
 const primary=persist.indexOf('const verifiedPrimary=global.localStorage.getItem(MATCH_SAVE_KEY)');
 const write=persist.indexOf('global.localStorage.setItem(MATCH_SAVE_KEY,raw)');
 assert.ok(rotate>=0&&backup>rotate&&primary>backup&&write>primary);
 assert.match(persist,/if\(verifiedBackup!==previous\|\|verifiedPrimary!==previous\)\{/);
 assert.match(persist,/Game\.restoreMatch\(previous\)/);
});
test('BR rejects a silent backup write failure without overwriting the primary',()=>{
 assert.match(persist,/saveIssue=verifiedPrimary!==previous\?'conflict':'write-failed'/);
 assert.match(persist,/PREVIOUS CHECKPOINT BACKUP NOT VERIFIED/);
 assert.match(persist,/nextMatchSaveRetryAt=simulation\.elapsed\+1/);
 assert.match(persist,/return false;\s*\}\s*\}\s*global\.localStorage\.setItem\(MATCH_SAVE_KEY,raw\)/);
});
test('BR still verifies new primary and refuses concurrent generation changes',()=>{
 assert.match(persist,/if\(previous!==\(matchDiskGeneration\|\|null\)\)/);
 assert.match(persist,/const verified=global\.localStorage\.getItem\(MATCH_SAVE_KEY\)/);
 assert.match(persist,/if\(verified!==raw\)/);
 assert.match(persist,/matchDiskGeneration=raw/);
});
