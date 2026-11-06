'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

// Execute the actual New Game storage-reset block with a controlled browser
// storage double. The source slice is bounded by stable in-function markers.
const source=fs.readFileSync(path.join(__dirname,'../src/story-app.js'),'utf8');
const start=source.indexOf('      let resetVerified=false,observedPrimary=diskGeneration');
const end=source.indexOf('      memoryOnlyStory=!resetVerified;',start);
assert.ok(start>=0&&end>start,'CH01 New Game reset block must exist');
const body=source.slice(start,end);
const execute=new Function('global','storage','diskGeneration','Story',
  'const SAVE_KEY="veilpoint.story.ch01",BACKUP_KEY="veilpoint.story.ch01.previous",PREVIEW_KEY="veilpoint.story.ch01PreviewCompleted";let staleReset=false;'+body+
  'return {resetVerified,staleReset};');

function run({primary='valid-primary',backup='valid-backup',denyPrimaryDelete=false,onBackupDelete=null,failPrimaryReadAfterBackupDelete=false}={}){
  const entries=new Map([['veilpoint.story.ch01',primary],
    ['veilpoint.story.ch01.previous',backup]]);
  let throwPrimaryRead=false;
  const localStorage={
    getItem(key){
      if(key==='veilpoint.story.ch01'&&throwPrimaryRead){
        throwPrimaryRead=false;
        throw new Error('transient Storage SecurityError after backup clear');
      }
      return entries.has(key)?entries.get(key):null;
    },
    setItem(key,value){entries.set(key,value);},
    removeItem(key){
      if(denyPrimaryDelete&&key==='veilpoint.story.ch01')return;
      entries.delete(key);
      if(key==='veilpoint.story.ch01.previous'){
        if(onBackupDelete)onBackupDelete(entries);
        if(failPrimaryReadAfterBackupDelete)throwPrimaryRead=true;
      }
    }
  };
  const storage={remove:key=>localStorage.removeItem(key),
    set:(key,value)=>{localStorage.setItem(key,value);return true;}};
  const result=execute({localStorage},storage,primary,{restore:()=>({})});
  return {result,entries};
}

test('CH01 denied primary reset restores older checkpoint backup',()=>{
  const {result,entries}=run({denyPrimaryDelete:true});
  assert.equal(result.resetVerified,false);
  assert.equal(entries.get('veilpoint.story.ch01'),'valid-primary');
  assert.equal(entries.get('veilpoint.story.ch01.previous'),'valid-backup');
});
test('CH01 successful explicit reset removes both generations',()=>{
  const {result,entries}=run();
  assert.equal(result.resetVerified,true);
  assert.equal(entries.has('veilpoint.story.ch01'),false);
  assert.equal(entries.has('veilpoint.story.ch01.previous'),false);
});

test('CH01 New Game reset refuses to delete primary updated by a second tab during backup clearing',()=>{
  const newer='newer-tab-verified-checkpoint';
  const {result,entries}=run({onBackupDelete:store=>{
    store.set('veilpoint.story.ch01',newer);
  }});
  assert.equal(result.resetVerified,false);
  assert.equal(result.staleReset,true);
  assert.equal(entries.get('veilpoint.story.ch01'),newer,
    'New Game may not erase a generation it did not initially observe');
  assert.equal(entries.get('veilpoint.story.ch01.previous'),'valid-backup',
    'the original fallback must remain recoverable after an aborted reset');
});

test('CH01 New Game reset preserves backup independently replaced by a second tab',()=>{
  const newPrimary='concurrent-primary',newBackup='concurrent-backup';
  const {result,entries}=run({onBackupDelete:store=>{
    store.set('veilpoint.story.ch01',newPrimary);
    store.set('veilpoint.story.ch01.previous',newBackup);
  }});
  assert.equal(result.resetVerified,false);
  assert.equal(result.staleReset,false,
    'a changed backup already prevents deleting primary before the extra check');
  assert.equal(entries.get('veilpoint.story.ch01'),newPrimary);
  assert.equal(entries.get('veilpoint.story.ch01.previous'),newBackup,
    'rollback cannot replace another tab\'s new backup');
});

test('CH01 New Game reset cannot remove latest primary if a prior generation was already invalid',()=>{
  const {result,entries}=run({
    primary:'{invalid-primary',
    onBackupDelete:store=>store.set('veilpoint.story.ch01','another-tab-valid-primary')
  });
  assert.equal(result.resetVerified,false);
  assert.equal(result.staleReset,true);
  assert.equal(entries.get('veilpoint.story.ch01'),'another-tab-valid-primary');
  assert.equal(entries.get('veilpoint.story.ch01.previous'),'valid-backup');
});

test('CH01 restores backup if browser getter throws after backup was cleared',()=>{
  const {result,entries}=run({failPrimaryReadAfterBackupDelete:true});
  assert.equal(result.resetVerified,false);
  assert.equal(entries.get('veilpoint.story.ch01'),'valid-primary');
  assert.equal(entries.get('veilpoint.story.ch01.previous'),'valid-backup');
});
test('CH01 transient reset failure preserves a concurrently replaced backup',()=>{
  const {result,entries}=run({
    failPrimaryReadAfterBackupDelete:true,
    onBackupDelete:store=>store.set('veilpoint.story.ch01.previous','other-tab-new-backup')
  });
  assert.equal(result.resetVerified,false);
  assert.equal(entries.get('veilpoint.story.ch01.previous'),'other-tab-new-backup');
  assert.equal(entries.get('veilpoint.story.ch01'),'valid-primary');
});
