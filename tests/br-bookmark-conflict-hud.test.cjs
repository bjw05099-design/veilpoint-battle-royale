'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const app=fs.readFileSync(path.resolve(__dirname,'../src/app.js'),'utf8');
const begin=app.indexOf('const bookmarkMessage=running&&');
const end=app.indexOf('// Every published phase',begin);
assert.ok(begin>=0&&end>begin,'bookmark warning must stay in the live BR HUD path');
const expression=app.slice(begin,end).trim();
const message=new Function('running','bookmarkIssue',expression+'\nreturn bookmarkMessage;');

test('BR HUD distinguishes another-tab bookmark conflict from denied disk writes',()=>{
 assert.match(message(true,'conflict'),/BOOKMARK CONFLICT/);
 assert.match(message(true,'conflict'),/ANOTHER TAB/);
 assert.match(message(true,'write-failed'),/MEMORY ONLY/);
 assert.notEqual(message(true,'conflict'),message(true,'write-failed'));
 assert.equal(message(true,null),'');
 assert.equal(message(false,'conflict'),'');
 assert.equal(message(false,'write-failed'),'');
});
