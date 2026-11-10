'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createBrSquadServer}=require('../server/br-squad-server.cjs');
const fs=require('node:fs'),path=require('node:path');
const token=i=>i.toString(16).padStart(64,'0');
async function nextWorld(reader,timeout=4500){
 const timer=new AbortController();
 const deadline=setTimeout(()=>timer.abort(),timeout);
 let collected='';
 try{
  for(let j=0;j<15;j++){
   const part=await Promise.race([
    reader.read(),
    new Promise((_,reject)=>timer.signal.addEventListener('abort',
     ()=>reject(new Error('terminal_sse_timeout')),{once:true}))
   ]);
   if(part.done)throw new Error('stream_ended');
   collected+=new TextDecoder().decode(part.value);
   const m=collected.match(/id: (\d+):(\d+)\nevent: world\ndata: ([^\n]+)\n\n/);
   if(m)return {round:Number(m[1]),tick:Number(m[2]),
    world:JSON.parse(m[3]),wire:collected};
   if(collected.length>98304)throw new Error('oversized private event');
  }
  throw new Error('missing_private_event');
 }finally{clearTimeout(deadline)}
}
test('a real 96-human loopback match sends the server-owned final result immediately at frozen tick 0',
 {timeout:18000},async()=>{
 const host=createBrSquadServer({port:0,autoTick:false});
 const addr=await host.listen(),base='http://127.0.0.1:'+addr.port;
 const ac=new AbortController();
 let reader;
 try{
  for(let i=0;i<96;i++)
   assert.equal(host.lobby.join(token(i),'Civilian '+i).ok,true);
  for(let i=0;i<95;i++)
   assert.equal(host.lobby.ready(token(i),true).ok,true);
  const last=await fetch(base+'/ready',{method:'POST',
   headers:{'content-type':'application/json','x-player-token':token(95)},
   body:'{"ready":true}'});
  assert.equal(last.status,200);assert.equal(host.world.tick,0);
  const response=await fetch(base+'/events',{
   headers:{'x-player-token':token(95),'Accept':'text/event-stream'},
   signal:ac.signal});
  assert.equal(response.status,200);
  reader=response.body.getReader();
  const initial=await nextWorld(reader);
  assert.equal(initial.round,1);
  assert.equal(initial.tick,0);
  assert.equal(initial.world.phase,'moving');
  assert.equal(host.liveStreamCount,1);
  // 89 real humans retire at the same server tick. The last 90th seat is
  // an authenticated HTTP request and settles the last surviving squad.
  for(let i=0;i<89;i++)assert.equal(host.world.withdraw(token(i)).ok,true);
  assert.equal(host.world.phase,'moving');
  const responseFinal=await fetch(base+'/withdraw',{method:'POST',
   headers:{'content-type':'application/json','x-player-token':token(89)},
   body:'{}'});
  assert.equal(responseFinal.status,200);
  const accepted=await responseFinal.json();
  assert.equal(accepted.phase,'finished');
  assert.equal(host.world.tick,0);
  const terminal=await nextWorld(reader);
  assert.equal(terminal.round,1);
  assert.equal(terminal.tick,0,'the server does not manufacture another tick');
  assert.equal(terminal.world.phase,'finished');
  assert.equal(terminal.world.remainingSquads,1);
  assert.equal(terminal.world.matchOutcome.kind,'squad_win');
  assert.doesNotMatch(terminal.wire,new RegExp(token(95)));
  for(let i=0;i<600;i++)host.step();
  assert.equal(host.world.tick,0);
  const after=await Promise.race([
   reader.read().then(()=> 'unexpected-world',()=> 'closed'),
   new Promise(resolve=>setTimeout(()=>resolve('no-repeated-frame'),90))
  ]);
  assert.equal(after,'no-repeated-frame');
 }finally{
  ac.abort();
  await reader?.cancel().catch(()=>{});
  await host.close();
 }
});
test('a non-progressing native server tick cannot repeat a terminal 4Hz event forever',()=>{
 const file=fs.readFileSync(path.join(__dirname,'../server/br-squad-server.cjs'),'utf8');
 assert.match(file,/if\(beforePhase==='moving'&&world\.phase==='finished'&&/);
 assert.match(file,/if\(world\.tick===beforeTick\|\|world\.tick%15!==0\)return/);
 assert.match(file,/const phaseBefore=world\.phase;\s*const result=world\.withdraw\(token\)/);
 assert.match(file,/if\(result\.ok&&phaseBefore==='moving'&&world\.phase==='finished'\)/);
 assert.match(file,/broadcastPrivateWorld\(\)/);
 assert.match(file,/world\.snapshot\(token\)/);
});
