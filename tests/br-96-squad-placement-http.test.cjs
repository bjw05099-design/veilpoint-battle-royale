'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createBrSquadServer}=require('../server/br-squad-server.cjs');
async function post(base,path,payload,secret){
 const headers={'content-type':'application/json'};
 if(secret)headers['x-player-token']=secret;
 const res=await fetch(base+path,{method:'POST',headers,body:JSON.stringify(payload)});
 return {status:res.status,value:await res.json()};
}
test('real localhost HTTP accepts only own withdrawal and publishes server-owned six-person squad status',async()=>{
 const host=createBrSquadServer({port:0,autoTick:false});
 const addr=await host.listen(),base='http://127.0.0.1:'+addr.port;
 try{
  const roster=[];
  for(let n=0;n<96;n++){
   const r=await post(base,'/join',{name:'Player '+n});
   assert.equal(r.status,201);
   roster.push(r.value);
  }
  for(let n=0;n<96;n++){
   const r=await post(base,'/ready',{ready:true},roster[n].token);
   assert.equal(r.status,200);
  }
  assert.equal(host.world.activeSquads,16);
  const forged=await post(base,'/withdraw',{other:roster[6].token},roster[0].token);
  assert.equal(forged.status,400);
  const anonymous=await post(base,'/withdraw',{},'f'.repeat(64));
  assert.equal(anonymous.status,401);
  const pre=await post(base,'/withdraw',{},roster[0].token);
  assert.equal(pre.status,200);
  assert.equal(pre.value.remainingSquads,16);
  assert.equal(pre.value.world.self.eligible,false);
  assert.equal(pre.value.world.standings[0].eligibleMembers,5);
  for(let n=1;n<6;n++){
   const r=await post(base,'/withdraw',{},roster[n].token);
   assert.equal(r.status,200);
   if(n===5){
    assert.equal(r.value.squadPlacement,16);
    assert.equal(r.value.remainingSquads,15);
   }
  }
  const other=await fetch(base+'/world',{headers:{'x-player-token':roster[6].token}}).then(r=>r.json());
  assert.equal(other.standings[0].placement,16);
  assert.equal(other.standings[1].placement,null);
  assert.equal(other.standings[1].eligibleMembers,6);
  assert.equal(JSON.stringify(other).includes(roster[0].token),false);
  const stale=await post(base,'/move',{seq:1,dx:1,dz:0},roster[0].token);
  assert.equal(stale.status,409);
  assert.equal(stale.value.reason,'out_of_round');
  const again=await post(base,'/withdraw',{},roster[0].token);
  assert.equal(again.status,409);
  assert.equal(again.value.reason,'already_withdrawn');
 }finally{await host.close();}
});
