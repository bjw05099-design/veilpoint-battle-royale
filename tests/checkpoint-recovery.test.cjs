'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const Recovery=require('../src/checkpoint-recovery.js');
const Story=require('../src/story-slice.js');
test('CH01 valid primary wins and survives recovery boundary',()=>{
 const primary=Story.serialize(Story.createState());
 const result=Recovery.recover(primary,'{broken',Story.recoverCheckpoint);
 assert.equal(result.source,'primary');
 assert.equal(result.state.phase,'terminal');
 assert.equal(result.state.world.player.x,0);
 assert.equal(result.state.world.player.z,12);
});
test('CH01 corrupt primary falls back to independently validated backup',()=>{
 const backup=Story.serialize(Story.createState());
 const result=Recovery.recover('{broken',backup,Story.recoverCheckpoint);
 assert.equal(result.source,'backup');
 assert.equal(result.state.phase,'terminal');
 assert.equal(result.state.world.player.x,0);
 assert.equal(result.state.world.player.z,12);
});
test('CH01 failed primary yields to playable backup, preserving mission precedence',()=>{
 const failed=Story.createState();
 failed.world.player.x=Story.POINTS.terminal.x;
 failed.world.player.z=Story.POINTS.terminal.z;
 assert.equal(Story.interact(failed).event,'terminal');
 failed.phase='failed';failed.world.status='lost';failed.world.player.health=0;
 const backup=Story.serialize(Story.createState());
 const result=Recovery.recover(Story.serialize(failed),backup,Story.recoverCheckpoint);
 assert.equal(result.source,'backup');
});
test('CH01 two corrupt generations do not propagate destructive error',()=>{
 assert.equal(Recovery.recover('{broken','{broken',Story.recoverCheckpoint),null);
 assert.equal(Recovery.recover(null,null,Story.recoverCheckpoint),null);
});
test('CH01 desktop loader retains both corrupt slots and loads recovery before app',()=>{
 const app=fs.readFileSync(path.resolve(__dirname,'../src/story-app.js'),'utf8');
 const html=fs.readFileSync(path.resolve(__dirname,'../story.html'),'utf8');
 assert.ok(app.includes('VeilpointCheckpointRecovery.recover(primary,backup,Story.recoverCheckpoint)'));
 assert.ok(!app.includes('storage.remove(SAVE_KEY);storage.remove(BACKUP_KEY);return null;'));
 assert.ok(html.indexOf('src/checkpoint-recovery.js')<html.indexOf('src/story-app.js'));
});

test('CH01 primary decoder exception retries backup without deleting persisted generations',()=>{
 const backup=Story.serialize(Story.createState());
 const calls=[];
 const restore=(primary,secondary)=>{
   calls.push([primary,secondary]);
   if(primary!==null)throw new Error('primary decoder failed');
   return Story.recoverCheckpoint(primary,secondary);
 };
 const result=Recovery.recover('{invalid-primary',backup,restore);
 assert.equal(result.source,'backup');
 assert.equal(result.state.phase,'terminal');
 assert.deepEqual(calls,[['{invalid-primary',backup],[null,backup]]);
});
test('CH01 backup exception and forged primary fallback are never accepted',()=>{
 const backup=Story.serialize(Story.createState());
 assert.equal(Recovery.recover('bad',backup,()=>{throw new Error('decode');}),null);
 assert.equal(Recovery.recover('bad',backup,(p)=>p===null?{source:'primary',state:{}}:(()=>{throw Error('decode')})()),null);
});

test('CH01 rejects malformed backup decoder results without corrupting stored generations',()=>{
 const primary='{invalid-primary}',backup='{backup-snapshot}';
 const invalid=[
  {source:'primary',state:{phase:'terminal',world:{player:{x:0,z:12}}}},
  {source:'backup',state:[]},
  {source:'backup',state:{phase:'terminal',world:{player:{x:Infinity,z:12}}}},
  {source:'backup',state:{phase:'terminal',world:{player:{x:0,z:NaN}}}},
  {source:'backup',state:{phase:'terminal',world:null}},
  {source:'backup',state:{phase:'terminal',world:{player:null}}}
 ];
 for(const candidate of invalid){
  const calls=[];
  const restore=(p,b)=>{calls.push([p,b]);if(p!==null)throw Error('primary failed');return candidate;};
  assert.equal(Recovery.recover(primary,backup,restore),null);
  assert.deepEqual(calls,[[primary,backup],[null,backup]]);
 }
});
test('CH01 recovery boundary contains throwing backup getters',()=>{
 const result=Recovery.recover('broken','backup',(p)=>{
  if(p!==null)throw Error('primary failed');
  return {source:'backup',get state(){throw Error('backup state getter failed');}};
 });
 assert.equal(result,null);
});

test('CH01 null-returning primary decoder retries independently playable backup',()=>{
 const backup=Story.serialize(Story.createState());
 const calls=[];
 const restore=(p,b)=>{
   calls.push([p,b]);
   return p===null?Story.recoverCheckpoint(null,b):null;
 };
 const result=Recovery.recover('{invalid-primary',backup,restore);
 assert.equal(result.source,'backup');
 assert.equal(result.state.phase,'terminal');
 assert.deepEqual(calls,[['{invalid-primary',backup],[null,backup]]);
});
test('CH01 null primary result never overwrites slots or accepts forged backup',()=>{
 const primary='bad-primary',backup='backup-data';
 let calls=0;
 assert.equal(Recovery.recover(primary,backup,(p)=>{
   calls++;
   return p===null?{source:'primary',state:{phase:'terminal',world:{player:{x:0,z:12}}}}:null;
 }),null);
 assert.equal(calls,2);
 assert.equal(Recovery.recover(null,null,()=>null),null);
});

test('CH01 loads an intact previous generation when latest slot is absent',()=>{
 const state=Story.createState();
 state.world.player.x=2;state.world.player.z=9;
 const backup=Story.serialize(state);
 const result=Recovery.recover(null,backup,Story.recoverCheckpoint);
 assert.equal(result.source,'backup');
 assert.equal(result.state.world.player.x,2);
 assert.equal(result.state.world.player.z,9);
 assert.equal(Story.serialize(result.state),backup,
  'restoring an intact slot must not silently replace its game progress');
});
test('CH01 null decoder also retries backup if primary key was removed',()=>{
 const backup=Story.serialize(Story.createState());
 const calls=[];
 const decoded=(primary,secondary)=>{
  calls.push([primary,secondary]);
  return calls.length===1?null:Story.recoverCheckpoint(primary,secondary);
 };
 const result=Recovery.recover(null,backup,decoded);
 assert.equal(result.source,'backup');
 assert.deepEqual(calls,[[null,backup],[null,backup]]);
});
test('CH01 refuses a malformed direct backup result before game resume',()=>{
 const backup=Story.serialize(Story.createState());
 let calls=0;
 const result=Recovery.recover('{broken',backup,()=>{
  calls++;
  return {source:'backup',state:{phase:'terminal',world:{player:{x:Infinity,z:12}}}};
 });
 assert.equal(result,null);
 assert.equal(calls,2,'backup should be revalidated without primary slot');
});
test('CH01 cannot claim a missing primary generation was restored',()=>{
 const backup=Story.serialize(Story.createState());
 const result=Recovery.recover(null,backup,(p,b)=>
  p===null&&b===backup?{source:'primary',state:Story.createState()}:null);
 assert.equal(result,null);
});
