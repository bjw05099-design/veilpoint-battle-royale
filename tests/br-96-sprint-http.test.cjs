'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createBrSquadServer}=require('../server/br-squad-server.cjs');
async function post(base,path,payload,token){
  const headers={'content-type':'application/json'};
  if(token)headers['x-player-token']=token;
  const response=await fetch(base+path,{method:'POST',headers,body:JSON.stringify(payload)});
  return {status:response.status,body:await response.json()};
}
test('96-actor loopback HTTP exposes authenticated sprint intent, not client-authored velocities',async()=>{
  const host=createBrSquadServer({port:0,autoTick:false});
  const address=await host.listen(),base='http://127.0.0.1:'+address.port;
  try{
    const roster=[];
    for(let i=0;i<96;i++){
      const joined=await post(base,'/join',{name:'Runner '+i});
      assert.equal(joined.status,201);roster.push(joined.body.token);
    }
    assert.equal((await post(base,'/pace',{sprint:true},roster[0])).status,409);
    for(const token of roster)
      assert.equal((await post(base,'/ready',{ready:true},token)).status,200);
    assert.equal((await post(base,'/pace',{sprint:true,dx:80},roster[0])).status,400);
    assert.equal((await post(base,'/pace',{sprint:'yes'},roster[0])).status,400);
    assert.equal((await post(base,'/pace',{sprint:true},'f'.repeat(64))).status,401);
    const start=(await fetch(base+'/world',{headers:{'x-player-token':roster[0]}})).json();
    const begun=await start;
    const request=await post(base,'/pace',{sprint:true},roster[0]);
    assert.equal(request.status,200);
    assert.equal(request.body.world.self.sprintHeld,true);
    assert.equal((await post(base,'/move',{seq:1,dx:0,dz:1},roster[0])).status,200);
    for(let i=0;i<10;i++)host.step();
    const end=await fetch(base+'/world',{headers:{'x-player-token':roster[0]}}).then(r=>r.json());
    assert.ok(end.self.z>begun.self.z);
    assert.ok(end.self.stamina<100);
    assert.equal(end.squad[1].id,request.body.world.squad[1].id);
    assert.equal(end.squad.every(p=>!Object.hasOwn(p,'stamina')),true,
      'stamina is personal traversal state, not a rival or teammate resource leak');
    assert.equal((await post(base,'/pace',{sprint:false},roster[0])).status,200);
    assert.equal((await post(base,'/withdraw',{},roster[0])).status,200);
    assert.equal((await post(base,'/pace',{sprint:true},roster[0])).status,409);
  }finally{await host.close();}
});
