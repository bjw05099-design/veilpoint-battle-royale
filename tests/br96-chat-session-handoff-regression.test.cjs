'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createDraftGuard}=require('../src/br96-squad-panel.js');
test('in-flight chat blocks double submit only within the same authenticated round',()=>{
 const g=createDraftGuard();
 assert.equal(g.begin('session-A',1,'original message'),true);
 assert.equal(g.begin('session-A',1,'duplicate'),false);
 assert.equal(g.shouldClear('session-A',1,'original message'),true);
 assert.equal(g.shouldClear('session-A',1,'new text'),false);
 assert.equal(g.finish('session-A',1),true);
 assert.equal(g.pending(),false);
});
test('session replacement supersedes orphaned old request without consuming new draft',()=>{
 const g=createDraftGuard();
 assert.equal(g.begin('old-token',1,'old draft'),true);
 assert.equal(g.begin('new-token',1,'new draft'),true);
 assert.equal(g.finish('old-token',1),false);
 assert.equal(g.shouldClear('old-token',1,'old draft'),false);
 assert.equal(g.shouldClear('new-token',1,'new draft'),true);
 assert.equal(g.pending(),true);
 assert.equal(g.finish('new-token',1),true);
 assert.equal(g.pending(),false);
});
test('new BR round recovers a pending composer, while malformed attempts cannot replace it',()=>{
 const g=createDraftGuard();
 assert.equal(g.begin('token',1,'first round'),true);
 assert.equal(g.begin('',2,'invalid'),false);
 assert.equal(g.begin('token',0,'invalid'),false);
 assert.equal(g.begin('token',2,'  '),false);
 assert.equal(g.shouldClear('token',1,'first round'),true);
 assert.equal(g.begin('token',2,'second round'),true);
 assert.equal(g.finish('token',1),false);
 assert.equal(g.shouldClear('token',2,'second round'),true);
 assert.equal(g.finish('token',2),true);
});
