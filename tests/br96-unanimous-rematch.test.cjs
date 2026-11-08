'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {createBrSquadServer}=require('../server/br-squad-server.cjs');
async function post(base,route,body,token){
 const r=await fetch(base+route,{method:'POST',
   headers:{'content-type':'application/json',...(token?{'x-player-token':token}:{})},
   body:JSON.stringify(body)});
 return {status:r.status,body:await r.json()};
}
test('96 real human sessions may only start a fresh server-owned round with unanimous authenticated consent',async()=>{
 const host=createBrSquadServer({port:0,autoTick:false});
 const address=await host.listen(),base='http://127.0.0.1:'+address.port;
 try{
  const participants=[];
  for(let n=0;n<96;n++){
   const response=await post(base,'/join',{name:'Member '+n});
   assert.equal(response.status,201);participants.push(response.body.token);
  }
  for(const token of participants)
   assert.equal((await post(base,'/ready',{ready:true},token)).status,200);
  const worldBefore=host.world;
  assert.equal(worldBefore.phase,'moving');
  assert.equal((await post(base,'/replay-consent',{ready:true},participants[0])).status,409,
    'an active round cannot be restarted by a player');
  for(let n=0;n<90;n++)
   assert.equal((await post(base,'/withdraw',{},participants[n])).status,200);
  assert.equal(worldBefore.phase,'finished');
  const firstResult=worldBefore.snapshot(participants[90]).matchOutcome;
  assert.equal(firstResult.kind,'squad_win');
  assert.equal((await post(base,'/replay-consent',{ready:true,team:1},participants[0])).status,400);
  assert.equal((await post(base,'/replay-consent',{ready:true},'f'.repeat(64))).status,401);
  for(let i=0;i<95;i++){
   const result=await post(base,'/replay-consent',{ready:true},participants[i]);
   assert.equal(result.status,200);
   assert.equal(result.body.roundNumber,1);
   assert.equal(result.body.replay.requested,i+1);
   assert.equal(result.body.replay.required,96);
  }
  assert.equal(host.world,worldBefore);
  assert.equal(host.world.phase,'finished','no 95/96 forced rematch');
  assert.equal((await post(base,'/replay-consent',{ready:false},participants[0])).body.replay.requested,94);
  assert.equal((await post(base,'/replay-consent',{ready:true},participants[0])).body.replay.requested,95);
  const all=await post(base,'/replay-consent',{ready:true},participants[95]);
  assert.equal(all.status,200);
  assert.equal(all.body.roundNumber,2);
  assert.equal(all.body.replay,null);
  assert.notEqual(host.world,worldBefore);
  assert.equal(host.world.phase,'moving');
  assert.equal(host.world.tick,0);
  assert.equal(host.world.actors.size,96);
  assert.equal(host.world.snapshot(participants[90]).self.eligible,true);
  assert.equal(host.world.snapshot(participants[0]).self.eligible,true);
  assert.equal(host.world.snapshot(participants[95]).self.squad,16);
  assert.equal(host.world.snapshot(participants[95]).self.slot,6);
  assert.deepEqual(host.world.placements,Array(16).fill(null));
  assert.deepEqual(worldBefore.snapshot(participants[90]).matchOutcome,firstResult,
    'old round final ranking stays immutable');
  assert.equal((await post(base,'/replay-consent',{ready:true},participants[0])).status,409);
  const stillHere=await fetch(base+'/state',{headers:{'x-player-token':participants[0]}});
  const current=await stillHere.json();
  assert.equal(current.roundNumber,2);
  assert.equal(current.world.phase,'moving');
 }finally{await host.close();}
});
test('PC BR96 rematch shows a voluntary 96-seat ballot and resets client round tick ordering',()=>{
 const ui=fs.readFileSync(path.join(__dirname,'../br96.html'),'utf8');
 const client=fs.readFileSync(path.join(__dirname,'../src/br96-client.js'),'utf8');
 assert.match(ui,/id="replayConsent" disabled/);
 assert.match(client,/next.roundNumber>state.roundNumber/);
 assert.match(client,/lastWorldTick=-1/);
 assert.match(client,/command\('\/replay-consent',\{ready\}/);
 assert.match(client,/state.replay.requested/);
});
