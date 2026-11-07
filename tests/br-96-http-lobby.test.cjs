'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createBrSquadServer}=require('../server/br-squad-server.cjs');
test('actual local HTTP service seats and tracks a full 96 human squad roster',async()=>{
 const service=createBrSquadServer({port:0});
 const addr=await service.listen();
 const base='http://127.0.0.1:'+addr.port;
 try{
  const sessions=await Promise.all(Array.from({length:96},async(_,i)=>{
    const res=await fetch(base+'/join',{method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({name:'Participant '+i})});
    assert.equal(res.status,201);return res.json();
  }));
  assert.equal(new Set(sessions.map(s=>s.token)).size,96,'session tokens are unique');
  assert.deepEqual([...new Set(sessions.map(s=>s.state.self.squad))].sort((a,b)=>a-b),
    Array.from({length:16},(_,i)=>i+1));
  const excess=await fetch(base+'/join',{method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({name:'Extra'})});
  assert.equal(excess.status,409);
  for(let i=0;i<95;i++){
    const res=await fetch(base+'/ready',{method:'POST',
      headers:{'content-type':'application/json','x-player-token':sessions[i].token},
      body:JSON.stringify({ready:true})});
    assert.equal(res.status,200);
  }
  const stateBefore=await fetch(base+'/state',{headers:{'x-player-token':sessions[0].token}}).then(r=>r.json());
  assert.equal(stateBefore.phase,'assembling');
  assert.equal(stateBefore.readyCount,95);
  const lock=await fetch(base+'/ready',{method:'POST',
    headers:{'content-type':'application/json','x-player-token':sessions[95].token},
    body:JSON.stringify({ready:true})}).then(r=>r.json());
  assert.equal(lock.locked,true);
  assert.equal(lock.state.phase,'roster_locked');
  assert.equal(lock.state.participants,96);
  assert.deepEqual(lock.state.squadSizes,Array(16).fill(6));
  assert.ok(lock.state.squad.every(p=>p?.ready===true));
  assert.equal(JSON.stringify(lock).includes(sessions[95].token),false,
    'public roster never echoes the bearer session token');
 }finally{await service.close();}
});
test('HTTP clients cannot seize squads, change rules or read another squad member token',async()=>{
 const service=createBrSquadServer({port:0});
 const addr=await service.listen(),base='http://127.0.0.1:'+addr.port;
 try{
  const bad=await fetch(base+'/join',{method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({name:'Hello',team:0})});
  assert.equal(bad.status,400,'clients may not choose a squad seat');
  const seat=await fetch(base+'/join',{method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({name:'테스트 유저'})}).then(r=>r.json());
  assert.equal(seat.state.self.squad,1);
  const forged=await fetch(base+'/ready',{method:'POST',
   headers:{'x-player-token':seat.token},body:JSON.stringify({ready:true,launch:true})});
  assert.equal(forged.status,400);
  assert.equal(service.lobby.snapshot(seat.token).self.ready,false);
  const unknown=await fetch(base+'/state',{headers:{'x-player-token':'f'.repeat(64)}});
  assert.equal(unknown.status,401);
  const foreign=await fetch(base+'/state',{headers:{'x-player-token':seat.token,origin:'https://foreign.example'}});
  assert.equal(foreign.status,403);
  const leave=await fetch(base+'/leave',{method:'POST',headers:{'x-player-token':seat.token},
    body:'{}'});
  assert.equal(leave.status,200);
  assert.equal(service.lobby.players.size,0);
 }finally{await service.close();}
});
