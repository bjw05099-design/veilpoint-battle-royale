'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createBrSquadServer}=require('../server/br-squad-server.cjs');
async function post(base,path,body,token){
 const headers={'content-type':'application/json'};
 if(token)headers['x-player-token']=token;
 const response=await fetch(base+path,{method:'POST',headers,body:JSON.stringify(body)});
 return {status:response.status,json:await response.json()};
}
test('96-person HTTP lobby supports only authenticated retired-squad viewing',async()=>{
 const host=createBrSquadServer({port:0,autoTick:false});
 const address=await host.listen(),base='http://127.0.0.1:'+address.port;
 try{
  const roster=[];
  for(let i=0;i<96;i++){
   const joined=await post(base,'/join',{name:'Spectator '+i});
   assert.equal(joined.status,201);roster.push(joined.json.token);
  }
  assert.equal((await post(base,'/spectate',{slot:2},roster[0])).status,409);
  for(const token of roster)assert.equal((await post(base,'/ready',{ready:true},token)).status,200);
  assert.equal((await post(base,'/spectate',{slot:2},roster[0])).status,409);
  assert.equal((await post(base,'/spectate',{slot:2},'f'.repeat(64))).status,401);
  assert.equal((await post(base,'/spectate',{slot:2,x:99},roster[0])).status,400);
  assert.equal((await post(base,'/spectate',{slot:99},roster[0])).status,400);
  assert.equal((await post(base,'/withdraw',{},roster[0])).status,200);
  const viewed=await post(base,'/spectate',{slot:2},roster[0]);
  assert.equal(viewed.status,200);
  assert.equal(viewed.json.world.self.eligible,false);
  assert.equal(viewed.json.world.spectatorView.slot,2);
  assert.equal(JSON.stringify(viewed).includes(roster[6]),false);
  assert.equal((await post(base,'/move',{seq:1,dx:1,dz:0},roster[0])).status,409);
  assert.equal((await post(base,'/withdraw',{},roster[1])).status,200);
  const gone=await fetch(base+'/world',{headers:{'x-player-token':roster[0]}}).then(r=>r.json());
  assert.equal(gone.spectatorView.slot,3);
  assert.equal(gone.spectatorView.automaticFallback,true);
  const actual=await fetch(base+'/world',{headers:{'x-player-token':roster[2]}}).then(r=>r.json());
  assert.deepEqual(gone.visible,actual.visible,'the replacement camera can only see its own legitimate sightlines');
  assert.equal(JSON.stringify(gone).includes(roster[6]),false,'opponent secrets stay private');
 }finally{await host.close();}
});
