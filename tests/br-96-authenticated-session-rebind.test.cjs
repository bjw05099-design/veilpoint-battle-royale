'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {BrSquadLobby}=require('../src/br-squad-lobby.cjs');
const {BrSquadWorld}=require('../src/br-squad-world.cjs');
const {createBrSquadServer}=require('../server/br-squad-server.cjs');
const token=i=>i.toString(16).padStart(64,'0');
function fullRoster(){
 const lobby=new BrSquadLobby();
 for(let i=0;i<96;i++)assert.equal(lobby.join(token(i),'Person '+i).ok,true);
 for(let i=0;i<96;i++)assert.equal(lobby.ready(token(i),true).ok,true);
 return lobby;
}
test('reconnecting after 96-person match start never moves, revives or replaces a squad actor',()=>{
 const lobby=fullRoster(),world=new BrSquadWorld(lobby);
 const old=token(0),fresh='f'.repeat(64);
 assert.equal(world.move(old,{seq:8,dx:1,dz:0}).ok,true);
 for(let i=0;i<3;i++)world.step();
 const before=world.snapshot(old),actor=world.actors.get(old);
 assert.equal(lobby.rebindSession(old,fresh).ok,true);
 assert.equal(world.rebindSession(old,fresh).ok,true);
 assert.equal(world.actors.get(fresh),actor,'original authoritative actor object is retained');
 assert.equal(world.actors.size,96);
 assert.equal(lobby.players.size,96);
 assert.equal(lobby.snapshot(fresh).self.id,before.self.id);
 assert.equal(lobby.snapshot(fresh).self.squad,before.self.squad);
 assert.equal(lobby.snapshot(fresh).self.slot,before.self.slot);
 assert.deepEqual(world.snapshot(fresh).self,before.self);
 assert.deepEqual(world.snapshot(fresh).squad,before.squad,
  'authenticated reconnect must not reorder the six visible teammate entries');
 assert.equal(world.move(fresh,{seq:8,dx:1,dz:0}).reason,'stale_input');
 assert.equal(world.move(fresh,{seq:9,dx:1,dz:0}).ok,true);
 assert.throws(()=>world.snapshot(old),/unknown_session/);
 assert.throws(()=>lobby.snapshot(old),/unknown_session/);
 assert.throws(()=>lobby.rebindSession(old,'e'.repeat(64)),/unknown_session/);
 assert.throws(()=>world.rebindSession(fresh,fresh),/invalid_session/);
});
test('loopback session handoff refuses forged data, preserves active 60Hz state and invalidates old token',async()=>{
 const host=createBrSquadServer({port:0,autoTick:false});
 const address=await host.listen(),base='http://127.0.0.1:'+address.port;
 const post=async(path,body,old)=>{
  const headers={'content-type':'application/json'};
  if(old)headers['x-player-token']=old;
  const res=await fetch(base+path,{method:'POST',headers,body:JSON.stringify(body)});
  return {status:res.status,body:await res.json()};
 };
 const get=async(path,secret)=>{
  const response=await fetch(base+path,{headers:{'x-player-token':secret}});
  return {status:response.status,body:await response.json()};
 };
 try{
  const secrets=[];
  for(let i=0;i<96;i++){
   const j=await post('/join',{name:'Human '+i});
   assert.equal(j.status,201);secrets.push(j.body.token);
  }
  assert.equal((await post('/resume-session',{},secrets[0])).status,409);
  for(const t of secrets)assert.equal((await post('/ready',{ready:true},t)).status,200);
  const old=secrets[0],before=await get('/world',old);
  assert.equal(before.status,200);
  const oldStream=await fetch(base+'/events',{headers:{'x-player-token':old}});
  assert.equal(oldStream.status,200);
  assert.equal(host.liveStreamCount,1,'prior live snapshot stream is active');
  assert.equal((await post('/resume-session',{token:'client-chosen'},old)).status,400);
  assert.equal((await post('/resume-session',{},'f'.repeat(64))).status,401);
  assert.equal((await post('/move',{seq:5,dx:1,dz:0},old)).status,200);
  host.step();host.step();
  const physical=await get('/world',old);
  const rotated=await post('/resume-session',{},old);
  assert.equal(rotated.status,200);
  const next=rotated.body.token;
  assert.equal(host.liveStreamCount,0,'rotation immediately closes the old live stream');
  await oldStream.body.cancel();
  assert.match(next,/^[a-f0-9]{64}$/);
  assert.notEqual(next,old);
  const after=await get('/world',next);
  assert.equal(after.status,200);
  assert.deepEqual(after.body.self,physical.body.self);
  assert.equal(after.body.tick,physical.body.tick);
  assert.deepEqual(after.body.standings,physical.body.standings);
  assert.equal(rotated.body.state.participants,96);
  assert.deepEqual(rotated.body.state.world.self,physical.body.self);
  assert.equal((await get('/world',old)).status,401);
  assert.equal((await get('/state',old)).status,401);
  assert.equal((await post('/move',{seq:6,dx:1,dz:0},old)).status,401);
  assert.equal((await post('/move',{seq:5,dx:1,dz:0},next)).status,409);
  assert.equal((await post('/move',{seq:6,dx:1,dz:0},next)).status,200);
  const rival=await get('/state',secrets[6]);
  assert.equal(rival.status,200);
  assert.equal(JSON.stringify(rival.body).includes(next),false,
    'no other squad can obtain a session secret via any roster field');
  assert.equal(host.world.actors.size,96);
 }finally{await host.close();}
});
