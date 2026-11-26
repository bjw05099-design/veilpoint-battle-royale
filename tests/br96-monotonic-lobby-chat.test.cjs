'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {BrSquadLobby}=require('../src/br-squad-lobby.cjs');

test('BR96 staging chat uses a server monotonic default instead of wall-clock time',()=>{
 const lobby=new BrSquadLobby();
 const token='a'.repeat(64);
 lobby.join(token,'Player');
 const wall=Date.now;
 try{
   Date.now=()=>9999999999999;
   assert.equal(lobby.chat(token,'hello').ok,true);
   const stamp=lobby.lobbyChatLast.get(token);
   assert.ok(Number.isSafeInteger(stamp)&&stamp>=0);
   assert.ok(stamp<9999999999999,'wall-clock leap cannot change the chat timestamp');
   assert.equal(lobby.chat(token,'repeated').reason,'chat_cooldown');
 }finally{Date.now=wall;}
});

test('BR96 cooldown is exactly three seconds and denied messages do not change history',()=>{
 const lobby=new BrSquadLobby(),token='b'.repeat(64);
 lobby.join(token,'Player');
 assert.equal(lobby.chat(token,'first',10000).ok,true);
 assert.equal(lobby.chat(token,'too soon',12999).reason,'chat_cooldown');
 assert.equal(lobby.chat(token,'second',13000).ok,true);
 assert.deepEqual(lobby.snapshot(token).lobbyChat.map(x=>x.text),['first','second']);
});
