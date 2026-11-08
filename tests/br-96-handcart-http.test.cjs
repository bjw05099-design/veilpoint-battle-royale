'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createBrSquadServer}=require('../server/br-squad-server.cjs');
const Sim=require('../src/simulation.js');
async function post(base,route,body,token){
 const res=await fetch(base+route,{method:'POST',headers:{
  'content-type':'application/json',...(token?{'x-player-token':token}:{})},
  body:JSON.stringify(body)});
 return {status:res.status,data:await res.json()};
}
test('BR96 T interaction is authenticated, local, server-stepped, and never lets a browser move a cart remotely',async()=>{
 const host=createBrSquadServer({port:0,autoTick:false});
 const addr=await host.listen(),base='http://127.0.0.1:'+addr.port;
 try{
  assert.equal((await post(base,'/handcart',{},null)).status,401,
    'anonymous requests are rejected even before a round exists');
  const tokens=[];
  for(let i=0;i<96;i++){
   const seat=await post(base,'/join',{name:'Harbor '+i});
   assert.equal(seat.status,201);tokens.push(seat.data.token);
  }
  for(const token of tokens)assert.equal((await post(base,'/ready',{ready:true},token)).status,200);
  assert.equal((await post(base,'/handcart',{},null)).status,401,
    'anonymous visitors cannot operate the live handcart');
  assert.equal((await post(base,'/handcart',{x:132,z:-121},tokens[0])).status,400,
    'browser may not supply coordinates or a push amount');
  assert.equal((await post(base,'/handcart',{},tokens[0])).status,409,
    'a remote valid session cannot operate the distant handcart');
  const cart=host.world.handcart.body;
  const actor=host.world.actors.get(tokens[0]);
  actor.x=cart.x;actor.z=cart.z+2.1; // Server-only test setup, not HTTP movement.
  const reply=await post(base,'/handcart',{},tokens[0]);
  assert.equal(reply.status,200);
  assert.equal(reply.data.action,'grip');
  assert.equal(reply.data.world.handcart.heldBySelf,true);
  assert.equal(JSON.stringify(reply.data).includes(tokens[0]),false);
  assert.equal((await post(base,'/move',{dx:0,dz:-1,seq:0},tokens[0])).status,200);
  const before=cart.z;
  for(let i=0;i<10;i++)host.step();
  assert.ok(cart.z<before);
  assert.ok(cart.z>before-Sim.DOCK_HANDCART.speed);
  assert.equal((await post(base,'/handcart',{},tokens[0])).data.action,'release');
  const released=cart.z;for(let i=0;i<3;i++)host.step();
  assert.equal(cart.z,released);
 }finally{await host.close();}
});
