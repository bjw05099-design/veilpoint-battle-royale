'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {BrSquadLobby}=require('../src/br-squad-lobby.cjs');
const {BrSquadWorld}=require('../src/br-squad-world.cjs');
const tok=i=>i.toString(16).padStart(64,'0');

function actualRound(){
  const lobby=new BrSquadLobby();
  for(let i=0;i<96;i++)assert.equal(lobby.join(tok(i),'Human '+i).ok,true);
  for(let i=0;i<96;i++)assert.equal(lobby.ready(tok(i),true).ok,true);
  return new BrSquadWorld(lobby);
}

test('the genuine 96-body chat rejects invisible bidi overrides without consuming a legitimate send',()=>{
  const w=actualRound();
  const controls=['\u061c','\u200e','\u200f','\u202a','\u202b','\u202c',
    '\u202d','\u202e','\u2066','\u2067','\u2068','\u2069'];
  for(const control of controls){
    const rejected=w.chat(tok(0),'동료 1 '+control+'2');
    assert.deepEqual(rejected,{ok:false,reason:'invalid_chat'});
  }
  assert.equal(w.squadChat[0].length,0,'rejected text does not enter private 6-person history');
  assert.equal(w.chatSerial,0,'rejected text does not create an event ID');
  assert.equal(w.actors.get(tok(0)).lastChatTick,undefined,
    'rejected invisible formatting must not steal the sender cooldown');
  const accepted=w.chat(tok(0),'동료 확인: 안전한 공공 보행로입니다.');
  assert.equal(accepted.ok,true);
  assert.equal(accepted.message.id,1);
  assert.deepEqual(w.snapshot(tok(1)).squadChat.map(e=>e.text),
    ['동료 확인: 안전한 공공 보행로입니다.']);
  assert.deepEqual(w.snapshot(tok(6)).squadChat,[],
    'another squad receives no chat content or hidden metadata');
  assert.equal(w.chat(tok(0),'유효하지만 너무 빠른 메시지').reason,'chat_cooldown');
});

test('ordinary RTL letters and emoji stay usable in six-person chat without hidden direction controls',()=>{
 const w=actualRound();
 const message='안녕하세요 / مرحبا / שלום / 🧭';
 assert.equal(w.chat(tok(0),message).ok,true);
 assert.equal(w.snapshot(tok(1)).squadChat[0].text,message);
});

test('BR96 finished-person journey reports never publish bench rest duration or another player path',()=>{
 const w=actualRound(),mine=w.actors.get(tok(0));
 // A valid server-internal historical duration may exist independently of
 // user-visible end-of-round reporting. No client may write this counter.
 mine.benchRestTicks=600;
 for(let i=0;i<40;i++)w.step();
 const before=mine.benchRestTicks;
 assert.equal(w.snapshot(tok(0)).personalRecap,null);
 for(let i=6;i<96;i++)assert.equal(w.withdraw(tok(i)).ok,true);
 assert.equal(w.phase,'finished');
 const recap=w.snapshot(tok(0)).personalRecap;
 assert.equal(mine.benchRestTicks,before,'server still retains honest physical recovery history');
 assert.equal(Object.hasOwn(recap,'benchRestSeconds'),false);
 assert.equal(Object.keys(recap).some(k=>/bench|rest|seat/i.test(k)),false);
 assert.equal(recap.roundTicks,w.tick);
 assert.equal(recap.ownSquadPlacement,1);
 assert.equal(w.snapshot(tok(6)).personalRecap.squad,2,
   'personal debrief remains scoped to its authenticated human');
});
