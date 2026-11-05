'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

// Execute the actual New Game storage-reset block with a controlled browser
// storage double. The source slice is bounded by stable in-function markers.
const source=fs.readFileSync(path.join(__dirname,'../src/story-app.js'),'utf8');
const start=source.indexOf('      try{\n        // Protect a *newer valid* save');
const end=source.indexOf('      }catch(_){resetVerified=false;}',start);
assert.ok(start>=0&&end>start,'CH01 New Game reset block must exist');
const body=source.slice(start+'      try{\n'.length,end);
const execute=new Function('global','storage','diskGeneration','Story',
  'const SAVE_KEY="veilpoint.story.ch01",BACKUP_KEY="veilpoint.story.ch01.previous",PREVIEW_KEY="veilpoint.story.ch01PreviewCompleted";let resetVerified=false,staleReset=false,observedPrimary=null;'+body+
  'return {resetVerified,staleReset};');

function run({primary='valid-primary',backup='valid-backup',denyPrimaryDelete=false}={}){
  const entries=new Map([['veilpoint.story.ch01',primary],
    ['veilpoint.story.ch01.previous',backup]]);
  const localStorage={
    getItem(key){return entries.has(key)?entries.get(key):null;},
    setItem(key,value){entries.set(key,value);},
    removeItem(key){
      if(denyPrimaryDelete&&key==='veilpoint.story.ch01')return;
      entries.delete(key);
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
