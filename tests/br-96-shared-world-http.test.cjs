'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createBrSquadServer}=require('../server/br-squad-server.cjs');
async function post(base,url,payload,token){
 const headers={'content-type':'application/json'};
 if(token)headers['x-player-token']=token;
 const res=await fetch(base+url,{method:'POST',headers,body:JSON.stringify(payload)});
 return {status:res.status,data:await res.json()};
}
test('a complete 16x6 HTTP lobby starts a real shared 96-body movement world',async()=>{
 const host=createBrSquadServer({port:0,autoTick:false}),addr=await host.listen();
 const base='http://127.0.0.1:'+addr.port;
 try{
  const joined=await Promise.all(Array.from({length:96},async(_,i)=>{
   const r=await post(base,'/join',{name:'Walker '+i});
   assert.equal(r.status,201);return r.data;
  }));
  assert.equal(host.world,null,'a partly unready lobby cannot start live traversal');
  assert.equal((await fetch(base+'/world',{headers:{'x-player-token':joined[0].token}})).status,409);
  for(let i=0;i<96;i++){
   const r=await post(base,'/ready',{ready:true},joined[i].token);
   assert.equal(r.status,200);
  }
  assert.equal(host.world.actors.size,96);
  const initial=await fetch(base+'/world',{headers:{'x-player-token':joined[0].token}}).then(r=>r.json());
  assert.equal(initial.phase,'moving');
  const result=await post(base,'/move',{seq:1,dx:0,dz:1},joined[0].token);
  assert.equal(result.status,200);
  for(let i=0;i<15;i++)host.step();
  const after=await fetch(base+'/world',{headers:{'x-player-token':joined[0].token}}).then(r=>r.json());
  assert.ok(after.self.z>initial.self.z);
  assert.equal(after.tick,15);
  assert.equal(after.squad.length,6);
  assert.equal(JSON.stringify(after).includes(joined[6].token),false);
  const fake=await post(base,'/move',{seq:2,dx:400,dz:0},joined[0].token);
  assert.equal(fake.status,400);
  const hijack=await post(base,'/move',{seq:2,dx:0,dz:1,squad:1},joined[0].token);
  assert.equal(hijack.status,400);
  const unauthorized=await post(base,'/move',{seq:1,dx:1,dz:0},'f'.repeat(64));
  assert.equal(unauthorized.status,401);
  const replay=await post(base,'/move',{seq:1,dx:-1,dz:-1},joined[0].token);
  assert.equal(replay.status,409);
  assert.equal(replay.data.reason,'stale_input');
 }finally{await host.close();}
});
