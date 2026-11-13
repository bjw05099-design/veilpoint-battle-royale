'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createBrSquadServer}=require('../server/br-squad-server.cjs');
test('authenticated HTTP combat validates its round, body and private authoritative outcome',async()=>{
 const host=createBrSquadServer({port:0,autoTick:false}),addr=await host.listen();
 const base='http://127.0.0.1:'+addr.port;
 const post=async(route,body,token,round=1)=>{
  const r=await fetch(base+route,{method:'POST',headers:{'content-type':'application/json',
   ...(token?{'x-player-token':token}:{}),...(round===null?{}:{'x-round-number':String(round)})},
   body:JSON.stringify(body)});
  return {status:r.status,data:await r.json()};
 };
 try{
  const players=[];
  for(let i=0;i<96;i++)players.push((await post('/join',{name:'Player '+i})).data.token);
  for(const token of players)assert.equal((await post('/ready',{ready:true},token)).status,200);
  const w=host.world;w.obstacles=[];
  let i=0;for(const actor of w.actors.values()){
   actor.x=90+(i%12)*3;actor.z=90+Math.floor(i++/12)*3;
  }
  const own=w.actors.get(players[0]),other=w.actors.get(players[6]);
  Object.assign(own,{x:0,z:0});Object.assign(other,{x:0,z:-20});
  const aim={seq:1,yaw:0,pitch:0};
  assert.equal((await post('/fire',aim)).status,401);
  assert.equal((await post('/fire',aim,players[0],null)).data.error,'round_generation_required');
  assert.equal((await post('/fire',aim,players[0],2)).data.error,'stale_round');
  assert.equal((await post('/fire',{...aim,damage:100},players[0])).status,400);
  assert.equal((await post('/reload',{seq:1,rounds:100},players[0])).status,400);
  assert.equal(own.weapon.loaded,12);assert.equal(other.weapon.health,100);
  const reply=await post('/fire',aim,players[0]);
  assert.equal(reply.status,200);assert.equal(reply.data.world.self.weapon.loaded,11);
  assert.ok(reply.data.world.revision>0);assert.equal(other.weapon.health,55);
  for(const field of ['target','hit','damage','targetHealth'])assert.equal(Object.hasOwn(reply.data,field),false);
  assert.equal((await post('/fire',aim,players[0])).status,409);
  const savedHealth=other.weapon.health;
  assert.equal((await post('/reload',{seq:2},players[0])).status,200);
  assert.equal((await post('/fire',{...aim,seq:3},players[0])).data.reason,'reloading');
  assert.equal(other.weapon.health,savedHealth);
  for(let n=0;n<108;n++)host.step();
  const after=await fetch(base+'/world',{headers:{'x-player-token':players[0]}}).then(r=>r.json());
  assert.equal(after.self.weapon.loaded,12);assert.equal(after.self.weapon.reserve,35);
  const raw=JSON.stringify(after);
  for(const token of players)assert.equal(raw.includes(token),false);
 }finally{await host.close();}
});
