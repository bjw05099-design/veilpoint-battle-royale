'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createBrSquadServer}=require('../server/br-squad-server.cjs');
const Sim=require('../src/simulation.js');
const token=i=>i.toString(16).padStart(64,'0');
test('BR96 HTTP clients see real public wet terrain but only their own verified footing',async()=>{
 const host=createBrSquadServer({port:0,autoTick:false});
 const addr=await host.listen(),base='http://127.0.0.1:'+addr.port;
 try{
  for(let i=0;i<96;i++)host.lobby.join(token(i),'Civil Visitor '+i);
  for(let i=0;i<95;i++)host.lobby.ready(token(i),true);
  const r=await fetch(base+'/ready',{method:'POST',headers:{
    'content-type':'application/json','x-player-token':token(95)},
    body:'{"ready":true}'});
  assert.equal(r.status,200);
  assert.equal((await fetch(base+'/world-geometry')).status,401);
  const geom=await fetch(base+'/world-geometry',{headers:{
    'x-player-token':token(0)}}).then(r=>r.json());
  const {x,z,width,depth}=Sim.WET_LOADING_PAD;
  assert.deepEqual(geom.environment,{wetLoadingPad:{x,z,width,depth}});
  assert.equal(Object.hasOwn(geom,'actors'),false);
  assert.equal(JSON.stringify(geom).includes(token(0)),false);
  const me=host.world.actors.get(token(0));
  me.x=x;me.z=z;
  const meView=await fetch(base+'/world',{headers:{
    'x-player-token':token(0)}}).then(r=>r.json());
  const otherView=await fetch(base+'/world',{headers:{
    'x-player-token':token(6)}}).then(r=>r.json());
  assert.equal(meView.self.surface.wet,true);
  assert.equal(otherView.self.surface.wet,Sim.wetApronFooting(host.world.actors.get(token(6))).wet);
  assert.equal(Object.hasOwn(otherView,'surfaceOfAllPlayers'),false);
  assert.equal(Object.hasOwn(geom,'token'),false);
  assert.equal((await fetch(base+'/world-geometry',{headers:{
    'x-player-token':'f'.repeat(64)}})).status,401);
 }finally{await host.close();}
});
