'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createBrSquadServer}=require('../server/br-squad-server.cjs');
test('loopback BR squad invite joins the correct roster without exposing another session token',async()=>{
 const host=createBrSquadServer({port:0,autoTick:false});
 const addr=await host.listen(),base='http://127.0.0.1:'+addr.port;
 async function post(path,body,token){
  const headers={'content-type':'application/json'};
  if(token)headers['x-player-token']=token;
  const res=await fetch(base+path,{method:'POST',headers,body:JSON.stringify(body)});
  return {status:res.status,data:await res.json()};
 }
 try {
  const members=[];
  for(let i=0;i<7;i++){
   const r=await post('/join',{name:'Player '+i});
   assert.equal(r.status,201);members.push(r.data.token);
  }
  assert.equal((await post('/squad-invite',{})).status,401);
  assert.equal((await post('/squad-invite',{team:1},members[6])).status,400);
  const owner=await post('/squad-invite',{},members[6]);
  assert.equal(owner.status,200);
  const code=owner.data.code;
  assert.match(code,/^[a-f0-9]{32}$/);
  assert.equal(owner.data.squad,2);
  assert.equal((await post('/leave',{},members[2])).status,200);
  const fraud=await post('/join',{name:'Injected',team:1,inviteCode:code});
  assert.equal(fraud.status,400,'untrusted team selection is forbidden');
  const missing=await post('/join',{name:'Unknown',inviteCode:'a'.repeat(32)});
  assert.equal(missing.status,409);
  assert.equal('token' in missing.data,false);
  const malformed=await post('/join',{name:'Bad',inviteCode:'invalid'});
  assert.equal(malformed.status,400);
  const friend=await post('/join',{name:'Friend',inviteCode:code});
  assert.equal(friend.status,201);
  assert.equal(friend.data.team,1);
  assert.equal(friend.data.slot,1);
  const ordinary=await post('/join',{name:'Other'});
  assert.equal(ordinary.status,201);
  assert.equal(ordinary.data.team,0);
  assert.equal(ordinary.data.slot,2);
  const state=await fetch(base+'/state',{headers:{'x-player-token':members[6]}}).then(x=>x.json());
  assert.deepEqual(state.squad.filter(Boolean).map(x=>x.name),['Player 6','Friend']);
  assert.equal(JSON.stringify(state).includes(code),false);
  assert.equal(JSON.stringify(state).includes(friend.data.token),false);
  assert.equal((await post('/leave',{},members[6])).status,200);
  const revoked=await post('/join',{name:'Revoked',inviteCode:code});
  assert.equal(revoked.status,409);
  assert.equal('token' in revoked.data,false);
 }finally{await host.close();}
});
