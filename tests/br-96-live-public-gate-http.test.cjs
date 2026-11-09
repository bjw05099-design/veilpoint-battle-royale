'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {createBrSquadServer}=require('../server/br-squad-server.cjs');
const token=i=>i.toString(16).padStart(64,'0');
async function call(base,route,token,body={}){
 const res=await fetch(base+route,{method:'POST',headers:{'content-type':'application/json',
  ...(token?{'x-player-token':token}:{})},body:JSON.stringify(body)});
 return {status:res.status,data:await res.json()};
}
test('96-human ferry gate is a local actor-controlled HTTP interaction with a single public moving collider',async()=>{
 const host=createBrSquadServer({port:0,autoTick:false});
 const addr=await host.listen(),base='http://127.0.0.1:'+addr.port;
 try{
  assert.equal((await call(base,'/civic-gate',null)).status,409);
  for(let i=0;i<96;i++)host.lobby.join(token(i),'Ferry Visitor '+i);
  for(let i=0;i<95;i++)host.lobby.ready(token(i),true);
  assert.equal((await call(base,'/ready',token(95),{ready:true})).status,200);
  const actor=host.world.actors.get(token(0));
  actor.x=-45;actor.z=140;
  assert.equal((await call(base,'/civic-gate','f'.repeat(64))).status,401);
  assert.equal((await call(base,'/civic-gate',token(0),{x:-45})).status,400,
    'client-authored world coordinates are forbidden');
  assert.equal((await call(base,'/civic-gate',token(6))).status,409,
    'distant squad cannot operate a door without being there');
  const started=await call(base,'/civic-gate',token(0));
  assert.equal(started.status,200);
  assert.equal(started.data.world.civicGate.state,'opening');
  assert.equal((await call(base,'/civic-gate',token(0))).data.reason,'in_motion');
  for(let i=0;i<200;i++)host.step();
  const world=await fetch(base+'/world',{headers:{'x-player-token':token(6)}}).then(r=>r.json());
  assert.equal(world.civicGate.state,'open','all 16 squads share the real 60Hz public door state');
  assert.equal(JSON.stringify(world).includes(token(0)),false);
  const geom=await fetch(base+'/world-geometry',{headers:{'x-player-token':token(0)}}).then(r=>r.json());
  assert.ok(!geom.obstacles.some(o=>o.type==='br96-civic-shutter'),
    'one-time static geometry must not draw a ghost door after movement');
  assert.deepEqual(
    host.world.obstacles.filter(o=>o.type==='br96-civic-shutter').map(o=>o.x),
    [world.civicGate.x]);
  assert.equal((await call(base,'/withdraw',token(0))).status,200);
  assert.equal((await call(base,'/civic-gate',token(0))).status,409);
 }finally{await host.close();}
});
test('physical door appears through valid static BR96 PC controls without client-authoritative pose',()=>{
 const html=fs.readFileSync(path.resolve(__dirname,'../br96.html'),'utf8');
 const client=fs.readFileSync(path.resolve(__dirname,'../src/br96-client.js'),'utf8');
 assert.match(html,/id="civicGate"/);
 assert.match(html,/F · 여객 문/);
 assert.match(client,/async function operateGate\(\)/);
 assert.match(client,/command\('\/civic-gate',\{\},null\)/);
 assert.match(client,/key==='KeyF'&&active\(\)/);
 assert.match(client,/el\('civicGate'\)\.addEventListener\('click',operateGate\)/);
 assert.match(client,/if\(w\.civicGate\)/);
 assert.doesNotMatch(client,/innerHTML\s*=/);
 assert.doesNotThrow(()=>new Function(client));
});
