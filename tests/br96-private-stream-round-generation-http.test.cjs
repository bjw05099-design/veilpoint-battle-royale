'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createBrSquadServer}=require('../server/br-squad-server.cjs');

async function post(base,url,body,token){
 const response=await fetch(base+url,{method:'POST',
  headers:{'content-type':'application/json',...(token?{'x-player-token':token}:{})},
  body:JSON.stringify(body)});
 return {status:response.status,data:await response.json()};
}
async function receiveFrame(reader,matcher){
 let frame='';
 for(let attempt=0;attempt<12;attempt++){
  let timer;
  let next;
  try{
   next=await Promise.race([
    reader.read(),
    new Promise((_,reject)=>{
     timer=setTimeout(()=>reject(new Error('stream_frame_timeout')),5000);
    })
   ]);
  }finally{clearTimeout(timer);}
  if(next.done)throw new Error('stream_ended_before_frame');
  frame+=new TextDecoder().decode(next.value);
  if(frame.length>98304)throw new Error('unexpected_stream_growth');
  const matching=frame.match(matcher);
  // Wait for a *complete* world packet, not merely its SSE id prefix.
  if(matching&&frame.slice(matching.index).includes('\n\n'))return frame;
 }
 throw new Error('stream_frame_not_received');
}
test('real HTTP BR96 stream carries server-owned round:tick across 96-human rematch without leaking secrets',async()=>{
 const host=createBrSquadServer({port:0,autoTick:false});
 const addr=await host.listen(),base='http://127.0.0.1:'+addr.port;
 const ac=new AbortController();
 try{
  const joined=[];
  for(let i=0;i<96;i++){
   const response=await post(base,'/join',{name:'Resident player '+i});
   assert.equal(response.status,201);joined.push(response.data.token);
  }
  for(const token of joined)
   assert.equal((await post(base,'/ready',{ready:true},token)).status,200);
  assert.equal(host.world.actors.size,96);
  const response=await fetch(base+'/events',{headers:{'x-player-token':joined[0]},
   signal:ac.signal});
  assert.equal(response.status,200);
  const reader=response.body.getReader();
  const first=await receiveFrame(reader,/id: 1:0\nevent: world\ndata: /);
  assert.match(first,/id: 1:0\nevent: world\ndata: /);
  assert.doesNotMatch(first,new RegExp(joined[0]));
  assert.doesNotMatch(first,new RegExp(joined[6]));
  assert.equal(host.liveStreamCount,1);
  for(let i=0;i<90;i++)
   assert.equal((await post(base,'/withdraw',{},joined[i])).status,200);
  assert.equal(host.world.phase,'finished');
  for(const token of joined){
   const vote=await post(base,'/replay-consent',{ready:true},token);
   assert.equal(vote.status,200);
  }
  assert.equal(host.world.phase,'moving');
  assert.equal(host.world.tick,0);
  for(let i=0;i<15;i++)host.step();
  const next=await receiveFrame(reader,/id: 2:15\nevent: world\ndata: /);
  assert.match(next,/id: 2:15\nevent: world\ndata: /);
  assert.doesNotMatch(next,new RegExp(joined[0]));
  assert.equal(host.world.tick,15);
  // A client cannot invent its own round number through movement input.
  const invalid=await post(base,'/move',{dx:0,dz:1,seq:1,roundNumber:9},joined[0]);
  assert.equal(invalid.status,400);
  ac.abort();
  await reader.cancel().catch(()=>{});
 }finally{
  ac.abort();await host.close();
 }
});
