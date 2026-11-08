'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {createBrSquadServer}=require('../server/br-squad-server.cjs');
const token=i=>i.toString(16).padStart(64,'0');
async function post(base,uri,who,body){
 const reply=await fetch(base+uri,{method:'POST',headers:{
  'content-type':'application/json',...(who?{'x-player-token':who}:{})},
  body:JSON.stringify(body)});
 return {status:reply.status,value:await reply.json()};
}
test('96 actual humans can select private squad staging approaches over authenticated HTTP before starting',async()=>{
 const host=createBrSquadServer({port:0,autoTick:false});
 const address=await host.listen(),base='http://127.0.0.1:'+address.port;
 try{
  for(let i=0;i<96;i++)host.lobby.join(token(i),'Human '+i);
  assert.equal((await post(base,'/entry-vote',null,{choice:'promenade'})).status,401);
  assert.equal((await post(base,'/entry-vote',token(0),{choice:'unknown-coordinates'})).status,400);
  assert.equal((await post(base,'/entry-vote',token(0),{choice:'lane',x:123})).status,400,
   'clients must never specify world positions');
  for(let i=0;i<4;i++){
   const result=await post(base,'/entry-vote',token(i),{choice:'promenade'});
   assert.equal(result.status,200);
   assert.equal(result.value.state.entry.choice,'promenade');
  }
  for(let i=4;i<6;i++)assert.equal((await post(base,'/entry-vote',token(i),{choice:'lane'})).status,200);
  const enemy=await fetch(base+'/state',{headers:{'x-player-token':token(6)}}).then(r=>r.json());
  assert.equal(enemy.entry.choice,'block');
  assert.deepEqual(enemy.entry.tally,{block:0,promenade:0,lane:0},
   'do not publish other squads votes');
  const our=await fetch(base+'/state',{headers:{'x-player-token':token(0)}}).then(r=>r.json());
  assert.deepEqual(our.entry.tally,{block:0,promenade:4,lane:2});
  assert.equal((await post(base,'/ready',token(0),{ready:true})).status,200);
  assert.equal((await post(base,'/entry-vote',token(0),{choice:'lane'})).status,409,
   'an already ready human must unready before changing their plan');
  for(let i=1;i<96;i++)assert.equal((await post(base,'/ready',token(i),{ready:true})).status,200);
  assert.equal(host.world.actors.size,96);
  assert.equal(host.world.entryPlans[0],'promenade');
  assert.equal(host.world.entryPlans[1],'block');
  assert.equal((await post(base,'/entry-vote',token(1),{choice:'block'})).status,409,
   'roster and squad entry choices lock with actual full readiness');
  const world0=await fetch(base+'/world',{headers:{'x-player-token':token(0)}}).then(r=>r.json());
  const world6=await fetch(base+'/world',{headers:{'x-player-token':token(6)}}).then(r=>r.json());
  assert.equal(world0.squadEntry,'promenade');
  assert.equal(world6.squadEntry,'block');
  assert.equal(JSON.stringify(world6).includes(token(0)),false,
   'opposing squad cannot read player secret from their snapshot');
 }finally{await host.close();}
});
test('legacy authenticated entry API remains guarded while the new PC lobby shows server-assigned starts without a ballot',()=>{
 const html=fs.readFileSync(path.resolve(__dirname,'../br96.html'),'utf8');
 const js=fs.readFileSync(path.resolve(__dirname,'../src/br96-client.js'),'utf8');
 assert.match(html,/id="entryVote"[^>]*hidden[^>]*aria-hidden="true"/);
 assert.match(html,/id="entryInfo"[^>]*>[^<]*서버가 분대별로 지정/);
 assert.match(js,/async function voteEntry\(\)/);
 assert.match(js,/command\('\/entry-vote',\{choice\},null\)/);
 assert.match(js,/!token\|\|state\?\.phase!=='assembling'\|\|!!state\?\.self\?\.ready/);
 assert.doesNotMatch(js,/득표/);
 assert.match(js,/서버가 실제 출발 위치를 지정합니다/);
 assert.match(js,/el\('entryVote'\)\.addEventListener\('click',voteEntry\)/);
 assert.doesNotMatch(js,/innerHTML\s*=/);
 assert.doesNotThrow(()=>new Function(js));
});
