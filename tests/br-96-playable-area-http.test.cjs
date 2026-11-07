'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createBrSquadServer}=require('../server/br-squad-server.cjs');
async function post(base,endpoint,body,token){
 const headers={'content-type':'application/json'};
 if(token)headers['x-player-token']=token;
 const response=await fetch(base+endpoint,{method:'POST',headers,body:JSON.stringify(body)});
 return {status:response.status,data:await response.json()};
}
test('96 real localhost clients see the same evolving server-only boundary and authentic team warnings',async()=>{
 const server=createBrSquadServer({port:0,autoTick:false});
 const addr=await server.listen(),base='http://127.0.0.1:'+addr.port;
 try{
  const joined=[];
  for(let i=0;i<96;i++){
   const r=await post(base,'/join',{name:'Member '+i});
   assert.equal(r.status,201);joined.push(r.data);
  }
  for(const j of joined)assert.equal((await post(base,'/ready',{ready:true},j.token)).status,200);
  const get=async i=>{
   const r=await fetch(base+'/world',{headers:{'x-player-token':joined[i].token}});
   assert.equal(r.status,200);return r.json();
  };
  const start=await get(0);
  assert.equal(start.playableArea.stage,'open');
  assert.equal(start.playableArea.radius,170);
  assert.equal(start.self.area.outside,false);
  const privateActor=server.world.actors.get(joined[0].token);
  privateActor.x=135;privateActor.z=0;
  server.world.tick=10200;
  for(let i=0;i<5;i++)server.step();
  const me=await get(0),mate=await get(1),rival=await get(6);
  assert.equal(me.playableArea.radius,85);
  assert.equal(me.self.area.outside,true);
  assert.equal(me.self.outsideAreaTicks,5);
  assert.equal(mate.squad[0].outsideArea,true);
  assert.equal(rival.squad.some(p=>p.id===me.self.id),false);
  assert.equal(rival.remainingSquads,16,
   'a round-area violation alone never fabricates a squad defeat');
  assert.equal(me.playableArea.radius,rival.playableArea.radius);
  const forged=await post(base,'/area',{radius:200},joined[0].token);
  assert.equal(forged.status,404,'no client API can author the circle');
  const query=await fetch(base+'/world?radius=999',{headers:{'x-player-token':joined[0].token}});
  assert.equal(query.status,400);
  assert.equal(JSON.stringify(mate).includes(joined[0].token),false);
 }finally{await server.close();}
});
