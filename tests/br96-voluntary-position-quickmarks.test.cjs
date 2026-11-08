'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {BrSquadLobby}=require('../src/br-squad-lobby.cjs');
const {BrSquadWorld,SIGNAL_TTL_TICKS,SIGNAL_COOLDOWN_TICKS}=require('../src/br-squad-world.cjs');
const {createBrSquadServer}=require('../server/br-squad-server.cjs');
const token=i=>i.toString(16).padStart(64,'0');
function launched(){
 const lobby=new BrSquadLobby();
 for(let i=0;i<96;i++)lobby.join(token(i),'Human '+i);
 for(let i=0;i<96;i++)lobby.ready(token(i),true);
 return new BrSquadWorld(lobby);
}
test('Q is an optional current-position suggestion: no votes, forced assembly, progress or placement',()=>{
 const world=launched();
 const member=world.actors.get(token(0));
 member.x=-28;member.z=80;
 const before={x:member.x,z:member.z};
 const suggestion=world.signal(token(0),'regroup');
 assert.equal(suggestion.ok,true);
 assert.equal(suggestion.signal.kind,'regroup');
 assert.deepEqual([suggestion.signal.x,suggestion.signal.z],[before.x,before.z]);
 const mate=world.snapshot(token(1));
 assert.deepEqual(mate.squadSignal,suggestion.signal);
 assert.equal(world.snapshot(token(6)).squadSignal,null);
 assert.equal('squadRoute' in mate,false);
 assert.equal('squadRegroup' in mate,false);
 assert.equal('routeChoice' in mate.self,false);
 assert.equal(typeof world.voteRoute,'undefined');
 assert.equal(typeof world.advanceRouteRendezvous,'undefined');
 assert.equal('routeRendezvous' in world,false);
 assert.equal('routeChoice' in member,false);
 // A different real human may leave the map pin completely alone without
 // losing eligibility, match placement, or being dragged to a location.
 const absent=world.actors.get(token(2));
 const away={x:absent.x,z:absent.z};
 for(let i=0;i<120;i++)world.step();
 assert.deepEqual([absent.x,absent.z],[away.x,away.z]);
 assert.equal(absent.eligible,true);
 assert.equal(world.snapshot(token(2)).self.placement,null);
 assert.equal(world.snapshot(token(1)).squadSignal.kind,'regroup');
 assert.equal(world.phase,'moving');
});
test('a suggestion follows only the sender server pose at issue time and cannot be forged or spy on another squad',()=>{
 const world=launched();
 const a=world.actors.get(token(0)),b=world.actors.get(token(6));
 a.x=-10;a.z=17;b.x=119;b.z=-63;
 assert.throws(()=>world.signal(token(0),{kind:'regroup',x:10,z:20}),/invalid_signal_kind/);
 assert.throws(()=>world.signal('missing','regroup'),/unknown_session/);
 const mark=world.signal(token(0),'regroup').signal;
 assert.deepEqual([mark.x,mark.z],[-10,17]);
 a.x+=20;
 assert.deepEqual([world.snapshot(token(1)).squadSignal.x,world.snapshot(token(1)).squadSignal.z],[-10,17],
   'quickmark is where the human actually pressed Q, not an automatic tracker');
 assert.equal(world.snapshot(token(6)).squadSignal,null);
 assert.equal(JSON.stringify(mark).includes(token(0)),false);
 assert.equal(JSON.stringify(mark).includes(token(6)),false);
 assert.equal(world.signal(token(0),'location').reason,'signal_cooldown');
 for(let t=0;t<SIGNAL_COOLDOWN_TICKS;t++)world.step();
 const second=world.signal(token(0),'location');
 assert.equal(second.ok,true);
 assert.deepEqual([second.signal.x,second.signal.z],[10,17]);
 for(let t=0;t<SIGNAL_TTL_TICKS;t++)world.step();
 assert.equal(world.snapshot(token(1)).squadSignal,null);
});
test('withdrawal of sender cancels the private pin immediately without affecting any other person',()=>{
 const world=launched();
 assert.equal(world.signal(token(0),'regroup').ok,true);
 assert.equal(world.withdraw(token(0)).ok,true);
 assert.equal(world.snapshot(token(1)).squadSignal,null);
 assert.equal(world.snapshot(token(1)).self.eligible,true);
 assert.deepEqual(world.signal(token(0),'regroup'),{ok:false,reason:'out_of_round'});
});
test('HTTP endpoint is a single authenticated quickmark, and the obsolete route-vote endpoint stays unavailable',async()=>{
 const host=createBrSquadServer({port:0,autoTick:false});
 const address=await host.listen(),base='http://127.0.0.1:'+address.port;
 async function post(url,body,credential){
  const result=await fetch(base+url,{method:'POST',
   headers:{'content-type':'application/json',...(credential?{'x-player-token':credential}:{})},
   body:JSON.stringify(body)});
  return {status:result.status,data:await result.json()};
 }
 try{
  const sessions=[];
  for(let i=0;i<96;i++){const joined=await post('/join',{name:'Human '+i});assert.equal(joined.status,201);sessions.push(joined.data.token);}
  for(const credential of sessions)assert.equal((await post('/ready',{ready:true},credential)).status,200);
  assert.equal((await post('/route-vote',{choice:'ferry'},sessions[0])).status,404);
  assert.equal((await post('/signal',{kind:'regroup',x:1,z:2},sessions[0])).status,400);
  assert.equal((await post('/signal',{kind:'regroup'},null)).status,401);
  const own=await fetch(base+'/world',{headers:{'x-player-token':sessions[0]}}).then(r=>r.json());
  const sent=await post('/signal',{kind:'regroup'},sessions[0]);
  assert.equal(sent.status,200);
  assert.deepEqual([sent.data.signal.x,sent.data.signal.z],[own.self.x,own.self.z]);
  const mate=await fetch(base+'/world',{headers:{'x-player-token':sessions[1]}}).then(r=>r.json());
  const rival=await fetch(base+'/world',{headers:{'x-player-token':sessions[6]}}).then(r=>r.json());
  assert.equal(mate.squadSignal.kind,'regroup');
  assert.equal(mate.squadRegroup,undefined);
  assert.equal(mate.squadRoute,undefined);
  assert.equal(rival.squadSignal,null);
  assert.equal(JSON.stringify(mate).includes(sessions[0]),false);
  assert.equal((await post('/route-vote',{choice:'shade'},sessions[1])).status,404);
 }finally{await host.close();}
});
