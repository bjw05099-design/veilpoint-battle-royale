'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {BrSquadLobby}=require('../src/br-squad-lobby.cjs');
const {BrSquadWorld,SIGNAL_TTL_TICKS,SIGNAL_COOLDOWN_TICKS}=require('../src/br-squad-world.cjs');
const token=i=>i.toString(16).padStart(64,'0');
function launched(){
 const lobby=new BrSquadLobby();
 for(let i=0;i<96;i++)lobby.join(token(i),'Member '+i);
 for(let i=0;i<96;i++)lobby.ready(token(i),true);
 return new BrSquadWorld(lobby);
}
test('96-human BR squad signals come from actual server-owned coordinates, never client map targets',()=>{
 const world=launched();
 const me=world.snapshot(token(0));
 const original=world.signal(token(0),'regroup');
 assert.equal(original.ok,true);
 assert.equal(original.signal.squad,1);
 assert.equal(original.signal.authorId,me.self.id);
 assert.equal(original.signal.x,me.self.x);
 assert.equal(original.signal.z,me.self.z);
 assert.equal(original.signal.issuedAtTick,0);
 assert.equal(original.signal.expiresAtTick,SIGNAL_TTL_TICKS);
 assert.deepEqual(world.snapshot(token(1)).squadSignal,original.signal,
  'another member of the SAME six-person squad sees real field location');
 assert.equal(world.snapshot(token(6)).squadSignal,null,
  'the second squad cannot see a private squad field signal');
 assert.equal(world.snapshot(token(95)).squadSignal,null);
 assert.equal(JSON.stringify(original.signal).includes(token(0)),false,
  'never publish a member bearer credential');
 assert.throws(()=>world.signal(token(0),{kind:'regroup',x:10,z:20}),/invalid_signal_kind/);
 assert.throws(()=>world.signal(token(999),'regroup'),/unknown_session/);
});
test('BR private field signals have a physical 5s cooldown and expire after a finite 15s',()=>{
 const world=launched();
 assert.equal(SIGNAL_COOLDOWN_TICKS,300);
 assert.equal(SIGNAL_TTL_TICKS,900);
 assert.equal(world.signal(token(0),'location').ok,true);
 const second=world.signal(token(0),'location');
 assert.equal(second.ok,false);
 assert.equal(second.reason,'signal_cooldown');
 assert.equal(second.retryTicks,300);
 for(let i=0;i<299;i++)world.step();
 assert.equal(world.signal(token(0),'location').reason,'signal_cooldown');
 world.step();
 assert.equal(world.signal(token(0),'location').ok,true);
 const next=world.snapshot(token(1)).squadSignal;
 assert.equal(next.issuedAtTick,300);
 for(let i=0;i<899;i++)world.step();
 assert.ok(world.snapshot(token(1)).squadSignal,'signal remains visible until its expiry tick');
 world.step();
 assert.equal(world.snapshot(token(1)).squadSignal,null);
});
test('withdrawing signal author immediately clears former signal, finished match is read-only',()=>{
 const world=launched();
 assert.equal(world.signal(token(0),'regroup').ok,true);
 assert.equal(world.withdraw(token(0)).ok,true);
 assert.equal(world.snapshot(token(1)).squadSignal,null);
 assert.deepEqual(world.signal(token(0),'location'),{ok:false,reason:'out_of_round'});
 for(let i=1;i<90;i++)world.withdraw(token(i));
 assert.equal(world.phase,'finished');
 assert.deepEqual(world.signal(token(90),'regroup'),{ok:false,reason:'out_of_round'});
 assert.equal(world.snapshot(token(90)).remainingSquads,1);
});
