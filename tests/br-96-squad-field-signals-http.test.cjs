'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createBrSquadServer}=require('../server/br-squad-server.cjs');
async function send(base,path,body,token){
 const headers={'content-type':'application/json'};
 if(token)headers['x-player-token']=token;
 const res=await fetch(base+path,{method:'POST',headers,body:JSON.stringify(body)});
 return {status:res.status,value:await res.json()};
}
test('real 96-human loopback HTTP signal stays inside original six-person squad',async()=>{
 const host=createBrSquadServer({port:0,autoTick:false});
 const address=await host.listen(),base='http://127.0.0.1:'+address.port;
 try {
  const roster=[];
  for(let i=0;i<96;i++){
   const r=await send(base,'/join',{name:'Human '+i});
   assert.equal(r.status,201);roster.push(r.value);
  }
  const premature=await send(base,'/signal',{kind:'regroup'},roster[0].token);
  assert.equal(premature.status,409);
  for(const p of roster)assert.equal((await send(base,'/ready',{ready:true},p.token)).status,200);
  const source=await fetch(base+'/world',{headers:{'x-player-token':roster[0].token}}).then(r=>r.json());
  const foreign=await send(base,'/signal',{kind:'location',x:999,z:999},roster[0].token);
  assert.equal(foreign.status,400,'caller may not write arbitrary team coordinates');
  const invalid=await send(base,'/signal',{kind:'enemy'},roster[0].token);
  assert.equal(invalid.status,400);
  const unauthorized=await send(base,'/signal',{kind:'regroup'},'f'.repeat(64));
  assert.equal(unauthorized.status,401);
  const set=await send(base,'/signal',{kind:'location'},roster[0].token);
  assert.equal(set.status,200);
  assert.deepEqual([set.value.signal.x,set.value.signal.z],
    [source.self.x,source.self.z]);
  const mate=await fetch(base+'/world',{headers:{'x-player-token':roster[1].token}}).then(r=>r.json());
  const rival=await fetch(base+'/world',{headers:{'x-player-token':roster[6].token}}).then(r=>r.json());
  assert.equal(mate.squadSignal.authorId,source.self.id);
  assert.equal(rival.squadSignal,null);
  assert.equal(JSON.stringify(mate).includes(roster[0].token),false);
  assert.equal((await send(base,'/signal',{kind:'regroup'},roster[0].token)).status,409);
  const withdrawn=await send(base,'/withdraw',{},roster[0].token);
  assert.equal(withdrawn.status,200);
  const after=await fetch(base+'/world',{headers:{'x-player-token':roster[1].token}}).then(r=>r.json());
  assert.equal(after.squadSignal,null);
 } finally {await host.close();}
});
