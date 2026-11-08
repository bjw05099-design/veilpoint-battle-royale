'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createBrSquadServer}=require('../server/br-squad-server.cjs');
const {BOUNDARY_GRACE_TICKS}=require('../src/br-squad-world.cjs');
async function post(base,path,body,token){
 const h={'content-type':'application/json'};
 if(token)h['x-player-token']=token;
 const response=await fetch(base+path,{method:'POST',headers:h,body:JSON.stringify(body)});
 return {status:response.status,data:await response.json()};
}
test('96 authenticated clients see private grace countdown and real server-owned retirement',async()=>{
 const host=createBrSquadServer({port:0,autoTick:false});
 const addr=await host.listen(),base='http://127.0.0.1:'+addr.port;
 try{
  const joined=[];
  for(let i=0;i<96;i++){
   const response=await post(base,'/join',{name:'Member '+i});
   assert.equal(response.status,201);joined.push(response.data.token);
  }
  for(const t of joined)assert.equal((await post(base,'/ready',{ready:true},t)).status,200);
  const w=host.world,player=w.actors.get(joined[0]);
  w.tick=10200;player.x=135;player.z=0;
  player.outsideStreakTicks=BOUNDARY_GRACE_TICKS-1;
  const before=await fetch(base+'/world',{headers:{'x-player-token':joined[0]}}).then(x=>x.json());
  assert.equal(before.self.boundaryGraceTicksRemaining,1);
  const spoof=await post(base,'/area',{grace:999},joined[0]);
  assert.equal(spoof.status,404,'clients cannot author expiry rules');
  assert.equal((await post(base,'/move',{seq:1,dx:0,dz:0,grace:99},joined[0])).status,400);
  host.step();
  const [own,mate,other]=await Promise.all([0,1,6].map(async i=>{
   const response=await fetch(base+'/world',{headers:{'x-player-token':joined[i]}});
   assert.equal(response.status,200);return response.json();
  }));
  assert.equal(own.self.eligible,false);
  assert.equal(mate.squad[0].eligible,false);
  assert.equal(other.squad.some(x=>x.id===own.self.id),false);
  assert.equal(other.remainingSquads,16);
  assert.equal((await post(base,'/move',{seq:2,dx:1,dz:0},joined[0])).status,409);
  assert.equal(JSON.stringify(mate).includes(joined[0]),false);
 }finally{await host.close();}
});
