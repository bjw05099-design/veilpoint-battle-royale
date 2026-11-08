'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createBrSquadServer}=require('../server/br-squad-server.cjs');
const token=i=>i.toString(16).padStart(64,'0');

function connect(base,t){
 const abort=new AbortController();
 return fetch(base+'/events',{headers:{'x-player-token':t},signal:abort.signal})
  .then(response=>{
   const reader=response.body?.getReader();
   let buffer='';
   const decoder=new TextDecoder();
   return {response,abort,async next(){
    for(;;){
     const cut=buffer.indexOf('\n\n');
     if(cut>=0){
      const frame=buffer.slice(0,cut);buffer=buffer.slice(cut+2);
      const line=frame.split('\n').find(line=>line.startsWith('data: '));
      if(line)return JSON.parse(line.slice(6));
      continue;
     }
     const part=await reader.read();
     if(part.done)throw new Error('live event stream ended unexpectedly');
     buffer+=decoder.decode(part.value,{stream:true});
    }
   },close(){abort.abort();}};
  });
}

test('private BR live stream conveys only the authenticated player snapshot at real 60Hz tick intervals',async()=>{
 const host=createBrSquadServer({port:0,autoTick:false});
 const addr=await host.listen();
 const base='http://127.0.0.1:'+addr.port;
 const streams=[];
 try{
  for(let i=0;i<96;i++){
   const joined=host.lobby.join(token(i),'Live '+i);
   assert.equal(joined.ok,true);
  }
  for(let i=0;i<95;i++)assert.equal(host.lobby.ready(token(i),true).ok,true);
  const r=await fetch(base+'/ready',{method:'POST',headers:{
   'content-type':'application/json','x-player-token':token(95)},
   body:JSON.stringify({ready:true})});
  assert.equal(r.status,200);
  assert.equal(host.world.actors.size,96);
  const unknown=await fetch(base+'/events',{headers:{'x-player-token':token(99)}});
  assert.equal(unknown.status,401,'no authenticated session, no stream');
  const a=await connect(base,token(0)),b=await connect(base,token(6));
  streams.push(a,b);
  assert.equal(a.response.status,200);
  assert.match(a.response.headers.get('content-type'),/text\/event-stream/);
  assert.equal(a.response.headers.get('cache-control'),'no-store');
  assert.equal(host.liveStreamCount,2);
  const first=await a.next(),other=await b.next();
  assert.equal(first.tick,0);assert.equal(other.tick,0);
  assert.deepEqual(first,host.world.snapshot(token(0)));
  assert.deepEqual(other,host.world.snapshot(token(6)));
  assert.equal(JSON.stringify(first).includes(token(6)),false);
  assert.equal(JSON.stringify(first).includes(token(0)),false,
   'authentication secrets never appear in game snapshots');
  assert.equal(JSON.stringify(other).includes(token(0)),false);
  const duplicate=await fetch(base+'/events',{headers:{'x-player-token':token(0)}});
  assert.equal(duplicate.status,409);
  assert.equal((await duplicate.json()).error,'stream_already_open');

  // A legal squad signal is privately delivered on the next shared tick,
  // whereas unrelated teammates never gain access to its location.
  assert.equal(host.world.signal(token(0),'regroup').ok,true);
  for(let i=0;i<14;i++)host.step();
  assert.equal(host.world.tick,14);
  host.step();
  const second=await a.next(),unrelated=await b.next();
  assert.equal(second.tick,15);assert.equal(unrelated.tick,15);
  assert.deepEqual(second,host.world.snapshot(token(0)));
  assert.deepEqual(unrelated,host.world.snapshot(token(6)));
  assert.equal(second.squadSignal?.kind,'regroup');
  assert.equal(unrelated.squadSignal,null);
  assert.equal(JSON.stringify(unrelated).includes(second.squadSignal.x.toString()+'|'+second.squadSignal.z),false);
  streams[0].close(); streams[1].close();
 }finally{
  for(const stream of streams)stream.close();
  await host.close();
 }
 assert.equal(host.liveStreamCount,0,'host shutdown cleans all live response handles');
});

test('no live SSE world snapshots before the full 96-player ready roster',async()=>{
 const host=createBrSquadServer({port:0,autoTick:false});
 const addr=await host.listen();
 try{
  host.lobby.join(token(0),'Before launch');
  const response=await fetch('http://127.0.0.1:'+addr.port+'/events',
   {headers:{'x-player-token':token(0)}});
  assert.equal(response.status,409);
  assert.equal((await response.json()).error,'round_not_started');
  assert.equal(host.liveStreamCount,0);
 }finally{await host.close();}
});
