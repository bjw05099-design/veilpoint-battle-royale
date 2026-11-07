'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createTeamServer}=require('../server/team-server.cjs');

test('local team health truthfully reports ready seats without disclosing player identity',async()=>{
 let clock=0;
 const server=createTeamServer({port:0,autoTick:false,now:()=>clock});
 const {port}=await server.listen(),base='http://127.0.0.1:'+port;
 const health=async()=>{const r=await fetch(base+'/health/diagnostics');assert.equal(r.status,200);return r.json();};
 const legacy=async()=>{const r=await fetch(base+'/health');assert.equal(r.status,200);return r.json();};
 const join=async name=>{
  const r=await fetch(base+'/join',{method:'POST',
   headers:{'content-type':'application/json'},body:JSON.stringify({name})});
  assert.equal(r.status,201);return r.json();
 };
 try{
  assert.deepEqual(await legacy(),{status:'ok',protocol:1,phase:'lobby'},
   'existing health clients must retain the exact public JSON contract');
  assert.deepEqual(await health(),{
   status:'ok',protocol:1,phase:'lobby',connectedPlayers:0,lobbyReadyPlayers:0,simulationTick:0
  });
  const first=await join('Local A'),second=await join('Local B');
  clock=25000;
  const ready=await fetch(base+'/command',{method:'POST',
   headers:{'content-type':'application/json','x-player-token':first.token},
   body:JSON.stringify({seq:1,type:'ready'})});
  assert.equal(ready.status,200);
  const report=await health();
  assert.equal(report.connectedPlayers,2);
  assert.equal(report.lobbyReadyPlayers,1);
  assert.equal(JSON.stringify(report).includes(first.token),false);
  assert.equal(JSON.stringify(report).includes(second.token),false);
  clock=30001;
  const cleared=await health();
  assert.equal(cleared.connectedPlayers,1,'health probe should reclaim expired lobby seats');
  assert.equal(cleared.lobbyReadyPlayers,0,'stale pairing cannot remain ready');
  assert.equal(cleared.simulationTick,0,'health must never advance the 60Hz world');
  assert.equal(server.match.players.get(first.token).lastSeen,25000,
   'health cannot renew the surviving client session lease');
 }finally{await server.close();}
});


test('local team diagnostics excludes expired combat seats without erasing results',async()=>{
 let now=0;
 const server=createTeamServer({port:0,autoTick:false,now:()=>now});
 const {port}=await server.listen(),base='http://127.0.0.1:'+port;
 const join=async name=>{
  const response=await fetch(base+'/join',{method:'POST',
   headers:{'content-type':'application/json'},body:JSON.stringify({name})});
  assert.equal(response.status,201);return response.json();
 };
 const command=async(token,seq,type)=>{
  const response=await fetch(base+'/command',{method:'POST',
   headers:{'content-type':'application/json','x-player-token':token},
   body:JSON.stringify({seq,type})});
  assert.equal(response.status,200);return response.json();
 };
 const diagnostic=async()=>{
  const response=await fetch(base+'/health/diagnostics');
  assert.equal(response.status,200);return response.json();
 };
 try{
  const a=await join('A'),b=await join('B');
  await command(a.token,1,'ready');
  await command(b.token,1,'ready');
  assert.equal(server.match.phase,'playing');
  now=25000;
  await command(a.token,2,'heartbeat');
  now=30001;
  const timeout=await diagnostic();
  assert.equal(timeout.phase,'ended','the expired peer ends the round');
  assert.equal(timeout.connectedPlayers,1,'retained stale seat is not connected');
  assert.equal(timeout.lobbyReadyPlayers,null);
  assert.equal(timeout.simulationTick,0,'diagnostics never steps the simulation');
  assert.equal(server.match.winner,'red');
  assert.equal(server.match.players.size,2,'finished seats remain for read-only results');
  now=56000;
  assert.equal((await diagnostic()).connectedPlayers,0);
  assert.equal(server.match.phase,'ended','monitoring cannot erase the finished match');
  const result=await fetch(base+'/state',{headers:{'x-player-token':a.token}});
  assert.equal(result.status,200);
  assert.equal((await result.json()).winner,'red');
  const body=JSON.stringify(await diagnostic());
  assert.equal(body.includes(a.token)||body.includes(b.token),false);
 }finally{await server.close();}
});
