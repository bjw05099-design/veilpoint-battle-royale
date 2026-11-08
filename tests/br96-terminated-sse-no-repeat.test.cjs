'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createBrSquadServer}=require('../server/br-squad-server.cjs');
const token=i=>i.toString(16).padStart(64,'0');
test('finished 96-human match never emits a terminal event 60x/second from its frozen tick',
 {timeout:12000},async()=>{
 const host=createBrSquadServer({port:0,autoTick:false});
 const location=await host.listen(),base='http://127.0.0.1:'+location.port;
 const controller=new AbortController();
 try{
  for(let i=0;i<96;i++)assert.equal(host.lobby.join(token(i),'Live '+i).ok,true);
  for(let i=0;i<95;i++)assert.equal(host.lobby.ready(token(i),true).ok,true);
  const launch=await fetch(base+'/ready',{method:'POST',headers:{
   'content-type':'application/json','x-player-token':token(95)
  },body:'{"ready":true}'});
  assert.equal(launch.status,200);
  assert.ok(host.world);
  const response=await fetch(base+'/events',{headers:{
   'x-player-token':token(90),'Accept':'text/event-stream'
  },signal:controller.signal});
  assert.equal(response.status,200);
  const reader=response.body.getReader(),decoder=new TextDecoder();
  let text='';
  while(!text.includes('event: world')||!text.includes('\n\n',text.indexOf('event: world'))){
   const part=await reader.read();
   assert.equal(part.done,false);
   text+=decoder.decode(part.value,{stream:true});
  }
  assert.match(text,/event: world\ndata: /);
  for(let i=0;i<15;i++)host.step();
  assert.equal(host.world.tick,15);
  // Retire 15 entire six-human teams. The 16th team remains the only winner.
  for(let i=0;i<90;i++)assert.equal(host.world.withdraw(token(i)).ok,true);
  assert.equal(host.world.phase,'finished');
  assert.equal(host.world.tick,15);
  // First consume the genuine tick=15 publication already queued. Exactly
  // one world event is permitted for the 15th tick.
  let count=(text.match(/event: world/g)||[]).length;
  while(count<2){
   const part=await reader.read();
   assert.equal(part.done,false);
   text+=decoder.decode(part.value,{stream:true});
   count=(text.match(/event: world/g)||[]).length;
  }
  const baselineCount=count;
  for(let i=0;i<900;i++)host.step();
  assert.equal(host.world.tick,15);
  assert.equal(host.world.snapshot(token(90)).phase,'finished');
  const extra=await Promise.race([
   reader.read().then(v=>({kind:'data',v}),()=>({kind:'aborted'})),
   new Promise(resolve=>setTimeout(()=>resolve({kind:'none'}),100))
  ]);
  assert.equal(extra.kind,'none','terminated round cannot flood live clients with duplicate terminal states');
  assert.equal(baselineCount,2);
 }finally{
  controller.abort();
  await host.close();
 }
});
