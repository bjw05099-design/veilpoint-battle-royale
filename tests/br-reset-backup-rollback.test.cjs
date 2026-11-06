'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const source=fs.readFileSync(path.resolve(__dirname,'../src/app.js'),'utf8');
const begin=source.indexOf('function clearStoredMatch(){');
const end=source.indexOf('function persistMatch(){',begin);
assert.ok(begin>=0&&end>begin,'production BR reset function must exist');
const clearSource=source.slice(begin,end);
const PRIMARY='veilpoint.brCheckpoint.v1';
const BACKUP=PRIMARY+'.previous';
function fixture({denyPrimary=false,denyBackup=false,onBackupDelete=null,
 onPrimaryDelete=null,initialPrimary='current-round',initialBackup='older-round'}={}){
 const entries=new Map([[PRIMARY,initialPrimary],[BACKUP,initialBackup]]);
 const storage={
  getItem(key){return entries.has(key)?entries.get(key):null;},
  removeItem(key){
   if(key===PRIMARY&&denyPrimary)return;
   if(key===BACKUP&&denyBackup)return;
   entries.delete(key);
   if(key===BACKUP&&onBackupDelete)onBackupDelete(entries);
   if(key===PRIMARY&&onPrimaryDelete)onPrimaryDelete(entries);
  },
  setItem(key,value){entries.set(key,value);}
 };
 const ctx={global:{localStorage:storage},MATCH_SAVE_KEY:PRIMARY,
  MATCH_BACKUP_KEY:BACKUP,running:false,matchDiskGeneration:initialPrimary};
 vm.runInNewContext(clearSource+';globalThis.clear=clearStoredMatch;',ctx,{timeout:1000});
 return {entries,clear:()=>ctx.clear(),ctx};
}
test('BR successful user reset clears both checkpoint generations',()=>{
 const f=fixture();
 assert.equal(f.clear(),true);
 assert.equal(f.entries.has(PRIMARY),false);
 assert.equal(f.entries.has(BACKUP),false);
 assert.equal(f.ctx.matchDiskGeneration,null);
});
test('BR denied primary deletion restores previous backup byte-for-byte',()=>{
 const f=fixture({denyPrimary:true,initialPrimary:'{broken primary bytes',
  initialBackup:'{"valid":"prior-generation"}'});
 assert.equal(f.clear(),false);
 assert.equal(f.entries.get(PRIMARY),'{broken primary bytes');
 assert.equal(f.entries.get(BACKUP),'{"valid":"prior-generation"}');
 assert.notEqual(f.ctx.matchDiskGeneration,null);
});
test('BR another tab updating primary during backup removal cannot lose previous backup',()=>{
 const f=fixture({onBackupDelete:entries=>{
  entries.set(PRIMARY,'newer-tab-checkpoint');
 }});
 assert.equal(f.clear(),false);
 assert.equal(f.entries.get(PRIMARY),'newer-tab-checkpoint');
 assert.equal(f.entries.get(BACKUP),'older-round');
});
test('BR rollback never overwrites another tab newer backup',()=>{
 const f=fixture({onPrimaryDelete:entries=>{
  entries.set(BACKUP,'newer-tab-backup');
 }});
 assert.equal(f.clear(),false);
 assert.equal(f.entries.get(BACKUP),'newer-tab-backup');
});
test('BR denied backup deletion does not touch primary checkpoint',()=>{
 const f=fixture({denyBackup:true});
 assert.equal(f.clear(),false);
 assert.equal(f.entries.get(PRIMARY),'current-round');
 assert.equal(f.entries.get(BACKUP),'older-round');
});
