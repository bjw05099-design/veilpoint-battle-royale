'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {createBrSquadServer}=require('../server/br-squad-server.cjs');
const read=p=>fs.readFileSync(path.resolve(__dirname,'..',p),'utf8');
const token=i=>i.toString(16).padStart(64,'0');
async function post(base,url,body,secret){
 const response=await fetch(base+url,{method:'POST',
  headers:{'content-type':'application/json','x-player-token':secret},body:JSON.stringify(body)});
 return {status:response.status,data:await response.json()};
}
test('BR96 UI offers explicit authenticated withdrawal, same-squad spectator controls and server-only rank',()=>{
 const html=read('br96.html'),js=read('src/br96-client.js');
 for(const id of ['withdraw','spectate','watchSlot'])assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(html,/경기 포기 후 같은 분대 관전/);
 assert.match(js,/async function withdraw\(\)/);
 assert.match(js,/withdrawArmedUntil=Date\.now\(\)\+8000/);
 assert.match(js,/Date\.now\(\)>=withdrawArmedUntil/);
 assert.match(js,/async function spectate\(\)/);
 assert.match(js,/command\('\/withdraw',\{\},null\)/);
 assert.match(js,/command\('\/spectate',\{slot\},null\)/);
 assert.match(js,/w\.squad\.some\(p=>p\.slot===slot&&p\.id!==w\.self\.id&&p\.eligible\)/);
 assert.match(js,/option\.textContent=p\.slot\+'번 분대원'/);
 assert.match(js,/w\.standings\?\.\[self\.squad-1\]/);
 assert.match(js,/w\.spectatorView/);
 assert.doesNotMatch(js,/\.innerHTML\s*=/);
 assert.doesNotThrow(()=>new Function(js));
});
test('retired player can truly select only their surviving teammates via the running HTTP host',async()=>{
 const host=createBrSquadServer({autoTick:false});
 const address=await host.listen(),base='http://127.0.0.1:'+address.port;
 try{
  for(let i=0;i<96;i++)host.lobby.join(token(i),'Local View '+i);
  for(let i=0;i<95;i++)host.lobby.ready(token(i),true);
  assert.equal((await post(base,'/ready',{ready:true},token(95))).status,200);
  assert.equal((await post(base,'/spectate',{slot:2},token(0))).status,409);
  const withdrawal=await post(base,'/withdraw',{},token(0));
  assert.equal(withdrawal.status,200);
  assert.equal(withdrawal.data.world.self.eligible,false);
  assert.equal(withdrawal.data.world.standings[0].eligibleMembers,5);
  const watch=await post(base,'/spectate',{slot:2},token(0));
  assert.equal(watch.status,200);
  assert.equal(watch.data.world.spectatorView.slot,2);
  assert.equal(watch.data.world.self.placement,null);
  assert.equal(JSON.stringify(watch.data).includes(token(6)),false);
  const noForeignSlot=await post(base,'/spectate',{slot:7},token(0));
  assert.equal(noForeignSlot.status,400);
  assert.equal((await post(base,'/withdraw',{},token(1))).status,200);
  const dropped=await fetch(base+'/world',{headers:{'x-player-token':token(0)}}).then(r=>r.json());
  assert.equal(dropped.spectatorView.slot,3);
  assert.equal(dropped.spectatorView.automaticFallback,true);
  const actual=await fetch(base+'/world',{headers:{'x-player-token':token(2)}}).then(r=>r.json());
  assert.deepEqual(dropped.visible,actual.visible,'replacement observer sees only their own real sightlines');
  const fallback=await post(base,'/spectate',{slot:3},token(0));
  assert.equal(fallback.status,200);
  assert.equal(fallback.data.world.spectatorView.slot,3);
  assert.equal((await post(base,'/move',{seq:1,dx:0,dz:1},token(0))).status,409);
 }finally{await host.close();}
});