'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {createBrSquadServer}=require('../server/br-squad-server.cjs');
const Sim=require('../src/simulation.js');
async function post(base,route,body,token){
 const response=await fetch(base+route,{method:'POST',headers:{
  'content-type':'application/json',...(token?{'x-player-token':token}:{})},
  body:JSON.stringify(body)});
 return {status:response.status,data:await response.json()};
}
test('BR96 public civic geometry is authenticated, stable and matches the 60Hz BR collision bodies',async()=>{
 const host=createBrSquadServer({port:0,autoTick:false});
 const addr=await host.listen(),base='http://127.0.0.1:'+addr.port;
 try{
  assert.equal((await fetch(base+'/world-geometry')).status,409,'pre-round map is not available');
  const players=[];
  for(let i=0;i<96;i++){
   const result=await post(base,'/join',{name:'Explorer '+i});
   assert.equal(result.status,201);
   players.push(result.data.token);
  }
  for(const token of players)assert.equal((await post(base,'/ready',{ready:true},token)).status,200);
  assert.equal((await fetch(base+'/world-geometry')).status,401,'anonymous world requests forbidden');
  assert.equal((await fetch(base+'/world-geometry',{headers:{
   'x-player-token':'f'.repeat(64)}})).status,401,'forged session forbidden');
  const reply=await fetch(base+'/world-geometry',{headers:{'x-player-token':players[0]}});
  assert.equal(reply.status,200);
  const data=await reply.json();
  assert.equal(data.schema,'veilpoint-br96-public-geometry-v1');
  // Dynamic handcart motion belongs to authenticated 60Hz snapshots, not
  // the cached once-per-round immutable public-building geometry.
  const expected=Sim.newMatch(20261108,0,'carbine').obstacles
   .filter(o=>o.routeId!=='br-dock-handcart')
   .map(o=>({x:o.x,z:o.z,w:o.w,d:o.d,h:o.h,type:o.type}));
  assert.deepEqual(data.obstacles,expected);
  assert.equal(data.obstacles.some(o=>o.type==='dock-handcart'),false,
    'a moving physical cart cannot be frozen at its initial cached position');
  const raw=JSON.stringify(data);
  for(const member of players)assert.equal(raw.includes(member),false,'never serialize any private token');
  assert.equal(raw.includes('eligibleMembers'),false,'not a covert opponent roster');
  const other=await fetch(base+'/world-geometry',{headers:{'x-player-token':players[6]}})
   .then(r=>r.json());
  assert.deepEqual(other,data,'public civilian geometry must not depend on or leak spectator identity');
  const world=await fetch(base+'/world',{headers:{'x-player-token':players[0]}})
   .then(r=>r.json());
  assert.equal(Object.hasOwn(world,'obstacles'),false,'high-rate private frames stay compact');
  assert.deepEqual(world.handcart,{x:Sim.DOCK_HANDCART.x,z:Sim.DOCK_HANDCART.z,
    w:Sim.DOCK_HANDCART.w,d:Sim.DOCK_HANDCART.d,h:Sim.DOCK_HANDCART.h,
    heldBySelf:false,moving:false},'real cart pose travels with the 60Hz world snapshot');
  assert.equal(Object.hasOwn(world,'publicGeometry'),false);
 }finally{await host.close();}
});
test('BR96 page loads static public obstacles only once per match, before drawing any server-filtered players',()=>{
 const code=fs.readFileSync(path.resolve(__dirname,'../src/br96-client.js'),'utf8');
 assert.match(code,/async function loadPublicGeometry\(\)/);
 assert.match(code,/request\('\/world-geometry'\)/);
 assert.match(code,/if\(w&&!publicGeometry&&!geometryBusy\)loadPublicGeometry\(\)/);
 assert.match(code,/ctx\.fillRect\(x\(solid\.x-solid\.w\/2\)/);
 assert.match(code,/for\(const rival of w\.visible\|\|\[\]\)/);
 assert.match(code,/publicGeometry=null;publicEnvironment=null;geometryBusy=false/);
 assert.doesNotThrow(()=>new Function(code));
});
