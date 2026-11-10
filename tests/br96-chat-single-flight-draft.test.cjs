'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const Panel=require('../src/br96-squad-panel.js');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');

test('a real human Enter+button double-submit has exactly one pending outgoing chat request',()=>{
 const g=Panel.createDraftGuard();
 assert.equal(g.pending(),false);
 assert.equal(g.begin('oldSession',1,'Hello, squad'),true);
 assert.equal(g.pending(),true);
 assert.equal(g.begin('oldSession',1,'Hello, squad'),false);
 assert.equal(g.begin('oldSession',1,'Second message'),false);
 assert.equal(g.shouldClear('oldSession',1,'Hello, squad'),true);
 assert.equal(g.finish('oldSession',1),true);
 assert.equal(g.pending(),false);
 assert.equal(g.begin('oldSession',1,'Second message'),true);
});

test('late HTTP chat acknowledgements can clear ONLY their own unchanged draft',()=>{
 const g=Panel.createDraftGuard();
 g.begin('teamA',12,'First draft');
 assert.equal(g.shouldClear('teamA',12,'New text typed while waiting'),false);
 assert.equal(g.shouldClear('anotherToken',12,'First draft'),false);
 assert.equal(g.shouldClear('teamA',13,'First draft'),false);
 assert.equal(g.shouldClear('teamA',12,'First draft'),true);
 assert.equal(g.finish('anotherToken',12),false);
 assert.equal(g.pending(),true);
 assert.equal(g.finish('teamA',13),false);
 assert.equal(g.pending(),true);
 assert.equal(g.finish('teamA',12),true);
});

test('session rotation or unanimous new round cannot let an old chat response erase a new player's text',()=>{
 const g=Panel.createDraftGuard();
 assert.equal(g.begin('old',5,'hello'),true);
 g.reset();
 assert.equal(g.begin('new',6,'already typing'),true);
 assert.equal(g.finish('old',5),false);
 assert.equal(g.pending(),true);
 assert.equal(g.shouldClear('old',5,'hello'),false);
 assert.equal(g.shouldClear('new',6,'already typing'),true);
 assert.equal(g.finish('new',6),true);
 assert.equal(g.pending(),false);
});

test('reject empty and invalid chat drafts before any network-side pending state',()=>{
 const g=Panel.createDraftGuard();
 for(const [tok,round,msg] of [['x',1,''],['x',1,' '],['',1,'hello'],['x',0,'hello'],
   ['x',1.3,'hello'],['x',Infinity,'hello']])
  assert.equal(g.begin(tok,round,msg),false);
 assert.equal(g.pending(),false);
});

test('same single-flight guard is browser-available and wired to the actual BR96 PC chat interface',()=>{
 const ctx=vm.createContext({});
 vm.runInContext(read('src/br96-squad-panel.js'),ctx);
 assert.equal(typeof ctx.VeilpointBR96SquadPanel.createDraftGuard,'function');
 const source=read('src/br96-client.js');
 const html=read('br96.html');
 assert.match(source,/const chatGuard=squadPanel\?\.createDraftGuard\?\.\(\)\|\|null/);
 assert.match(source,/chatGuard\.begin\(ownerToken,ownerRound,draft\)/);
 assert.match(source,/chatGuard\?\.shouldClear\(ownerToken,ownerRound,input\.value\)/);
 assert.match(source,/chatGuard\?\.finish\(ownerToken,ownerRound\)/);
 assert.match(source,/chatGuard\?\.reset\(\)/);
 assert.match(source,/if\(!result\?\.ok\|\|token!==ownerToken/);
 assert.match(source,/el\('sendSquadChat'\)\.disabled=!canChat\|\|!!chatGuard\?\.pending\(\)/);
 assert.match(html,/id="squadChatInput"/);
 assert.match(html,/id="sendSquadChat"/);
 // Browser UI must NOT ever put the secret player token in a chat event.
 assert.doesNotMatch(source,/body:\s*JSON\.stringify\(\{.*token.*text/);
});
