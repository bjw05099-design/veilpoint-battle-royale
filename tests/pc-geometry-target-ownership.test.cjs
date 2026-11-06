'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const source=fs.readFileSync(path.join(__dirname,'../scripts/verify-pc-viewport.cjs'),'utf8');
const audit=source.slice(source.indexOf('function audit(){'),source.indexOf('function auditStoryRoute(){'));
const match=audit.match(/if\((!node\|\|!root\.contains\(node\)\|\|!current\.visible\|\|!current\.enabled)\)\{/);
assert.ok(match,'BR geometry gate must require ownership by the active page');
const unavailable=vm.runInNewContext('(node,root,current)=>'+match[1]);

test('PC geometry rejects a visible, enabled button belonging to a different page',()=>{
 const node={id:'brImportApply'};
 const root={contains:()=>false};
 assert.equal(unavailable(node,root,{visible:true,enabled:true}),true);
});

test('PC geometry accepts an owned visible enabled target for further hit testing',()=>{
 const node={id:'brImportApply'};
 const root={contains:n=>n===node};
 assert.equal(unavailable(node,root,{visible:true,enabled:true}),false);
 assert.equal(unavailable(node,root,{visible:false,enabled:true}),true);
 assert.equal(unavailable(node,root,{visible:true,enabled:false}),true);
 assert.equal(unavailable(null,root,{visible:false,enabled:false}),true);
});
