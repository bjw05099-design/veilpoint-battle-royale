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
 const failed=Story.createState();failed.phase='failed';failed.world.status='lost';
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
