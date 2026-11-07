'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createBrSquadServer}=require('../server/br-squad-server.cjs');
async function post(base,url,body,token){
 const headers={'content-type':'application/json'};
 if(token)headers['x-player-token']=token;
 const response=await fetch(base+url,{method:'POST',headers,body:JSON.stringify(body)});
 return {status:response.status,body:await response.json()};
}
test('actual loopback 96-player HTTP server reports a single authenticated connection heartbeat',async()=>{
 const host=createBrSquadServer({port:0,autoTick:false}),addr=await host.listen();
 const base='http://127.0.0.1:'+addr.port;
 try{
  const sessions=[];
  for(let n=0;n<96;n++){
   const r=await post(base,'/join',{name:'Participant '+n});
   assert.equal(r.status,201);sessions.push(r.body);
  }
  assert.equal((await post(base,'/heartbeat',{},sessions[0].token)).status,409,
   'not yet a live match');
  for(const s of sessions)assert.equal((await post(base,'/ready',{ready:true},s.token)).status,200);
  for(let i=0;i<600;i++)host.step();
  const prior=await fetch(base+'/world',{headers:{'x-player-token':sessions[0].token}}).then(r=>r.json());
  assert.equal(prior.self.connection,'stale');
  assert.equal(prior.remainingSquads,16);
  assert.equal((await post(base,'/heartbeat',{team:0},sessions[0].token)).status,400,
   'clients cannot submit fabricated body position or squad identity');
  assert.equal((await post(base,'/heartbeat',{},'f'.repeat(64))).status,401);
  const renewed=await post(base,'/heartbeat',{},sessions[0].token);
  assert.equal(renewed.status,200);
  assert.equal(renewed.body.world.self.connection,'fresh');
  assert.equal(renewed.body.world.squad[1].connection,'stale');
  const teamMate=await fetch(base+'/world',{headers:{'x-player-token':sessions[1].token}}).then(r=>r.json());
  assert.equal(teamMate.squad[0].connection,'fresh');
  const rival=await fetch(base+'/world',{headers:{'x-player-token':sessions[6].token}}).then(r=>r.json());
  assert.equal(rival.squad.every(m=>m.connection==='stale'),true);
  assert.equal(rival.remainingSquads,16);
  const staleToken=await post(base,'/withdraw',{},sessions[0].token);
  assert.equal(staleToken.status,200);
  assert.equal((await post(base,'/heartbeat',{},sessions[0].token)).status,409);
 } finally {await host.close();}
});
