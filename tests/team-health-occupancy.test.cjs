'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createTeamServer}=require('../server/team-server.cjs');

test('local team health truthfully reports ready seats without disclosing player identity',async()=>{
 let clock=0;
 const server=createTeamServer({port:0,autoTick:false,now:()=>clock});
 const {port}=await server.listen(),base='http://127.0.0.1:'+port;
 const health=async()=>{const r=await fetch(base+'/health');assert.equal(r.status,200);return r.json();};
 const join=async name=>{
  const r=await fetch(base+'/join',{method:'POST',
   headers:{'content-type':'application/json'},body:JSON.stringify({name})});
  assert.equal(r.status,201);return r.json();
 };
 try{
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
