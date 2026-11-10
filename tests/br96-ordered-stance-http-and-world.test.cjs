'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {BrSquadLobby}=require('../src/br-squad-lobby.cjs');
const {BrSquadWorld}=require('../src/br-squad-world.cjs');
const {createBrSquadServer}=require('../server/br-squad-server.cjs');
const fs=require('node:fs'),path=require('node:path');
const token=n=>n.toString(16).padStart(64,'0');
function fullWorld(){
 const lobby=new BrSquadLobby();
 for(let n=0;n<96;n++)assert.equal(lobby.join(token(n),'Civil '+n).ok,true);
 for(let n=0;n<96;n++)assert.equal(lobby.ready(token(n),true).ok,true);
 return new BrSquadWorld(lobby);
}
test('BR96 96-body server accepts newest ordered sprint/crouch, rejects stale requests and keeps previous stance',()=>{
 const w=fullWorld(),own=token(0),other=token(6);
 assert.equal(w.actors.size,96);
 assert.equal(w.pace(own,{sprint:true,crouch:false,seq:3}).ok,true);
 assert.equal(w.pace(own,{sprint:false,crouch:true,seq:4}).ok,true);
 assert.deepEqual(w.pace(own,{sprint:true,crouch:false,seq:2}),
  {ok:false,reason:'stale_stance'});
 assert.deepEqual(w.pace(own,{sprint:true,crouch:false,seq:4}),
  {ok:false,reason:'stale_stance'});
 assert.deepEqual(w.pace(own,{sprint:true}),
  {ok:false,reason:'stance_sequence_required'});
 const self=w.snapshot(own).self,peer=w.snapshot(other).self;
 assert.equal(self.crouched,true);assert.equal(self.sprintHeld,false);
 assert.equal(self.stanceSeq,4);
 assert.equal(peer.stanceSeq,-1,'unrelated human sessions do not share input sequence');
 const start=w.actors.get(own);
 assert.equal(w.move(own,{dx:0,dz:1,seq:1}).ok,true);
 const z=start.z;
 w.step();
 const delta=Math.hypot(start.x-self.x,start.z-z);
 assert.ok(delta<=3/60+1e-4,'server movement uses the latest crouched pace');
});
test('BR96 rotating one seat does not reopen old tokens or reset authoritative stance sequence',()=>{
 const w=fullWorld(),old=token(1),next=token(200);
 assert.equal(w.pace(old,{sprint:true,crouch:false,seq:7}).ok,true);
 assert.equal(w.rebindSession(old,next).ok,true);
 assert.equal(w.snapshot(next).self.stanceSeq,7);
 assert.equal(w.snapshot(next).self.sprintHeld,false,
  'a newly authenticated transport session starts with neutral input');
 assert.throws(()=>w.pace(old,{sprint:true,crouch:true,seq:10}),/unknown_session/);
 assert.deepEqual(w.pace(next,{sprint:true,crouch:true,seq:6}),
  {ok:false,reason:'stale_stance'});
 assert.equal(w.pace(next,{sprint:false,crouch:true,seq:8}).ok,true);
 assert.equal(w.snapshot(next).self.crouched,true);
});
test('legacy BR96 stance client remains valid until a sequenced PC command is observed',()=>{
 const w=fullWorld(),own=token(2);
 assert.equal(w.pace(own,{sprint:true}).ok,true);
 assert.equal(w.snapshot(own).self.stanceSeq,-1);
 assert.throws(()=>w.pace(own,{sprint:true,seq:-1}),/invalid_pace/);
 assert.equal(w.pace(own,{sprint:false,seq:1}).ok,true);
 assert.equal(w.pace(own,{sprint:true}).reason,'stance_sequence_required');
});
test('real loopback HTTP 96-person stance requests are ordered, authenticated and preserve server snapshots',async()=>{
 const server=createBrSquadServer({port:0,autoTick:false});
 const addr=await server.listen(),base='http://127.0.0.1:'+addr.port;
 const post=async(route,body,t)=>{const response=await fetch(base+route,{method:'POST',
  headers:{'content-type':'application/json',...(t?{'x-player-token':t}:{})},
  body:JSON.stringify(body)});return {status:response.status,body:await response.json()};};
 try{
  const sessions=[];
  for(let n=0;n<96;n++){const joined=await post('/join',{name:'Walker '+n});assert.equal(joined.status,201);sessions.push(joined.body.token);}
  for(const t of sessions)assert.equal((await post('/ready',{ready:true},t)).status,200);
  const first=await post('/pace',{sprint:true,crouch:false,seq:3},sessions[0]);
  assert.equal(first.status,200);assert.equal(first.body.world.self.stanceSeq,3);
  const latest=await post('/pace',{sprint:false,crouch:true,seq:4},sessions[0]);
  assert.equal(latest.status,200);assert.equal(latest.body.world.self.crouched,true);
  const stale=await post('/pace',{sprint:true,crouch:false,seq:2},sessions[0]);
  assert.equal(stale.status,409);assert.equal(stale.body.reason,'stale_stance');
  const invalid=await post('/pace',{sprint:false,crouch:true,seq:1.2},sessions[0]);
  assert.equal(invalid.status,400);
  assert.equal((await post('/pace',{sprint:true,seq:5})).status,401);
  const observer=await fetch(base+'/world',{headers:{'x-player-token':sessions[0]}});
  assert.equal(observer.status,200);const view=await observer.json();
  assert.equal(view.self.stanceSeq,4);assert.equal(view.self.crouched,true);
  assert.equal(JSON.stringify(view).includes(sessions[1]),false);
 }finally{await server.close();}
});
test('PC browser sends and restores independent 96-body stance order without sending raw positions',()=>{
 const source=fs.readFileSync(path.resolve(__dirname,'../src/br96-client.js'),'utf8');
 assert.match(source,/stanceSeq=Math.max\(stanceSeq,next\.world\.self\.stanceSeq\)/);
 assert.match(source,/request\('\/pace',\{sprint:newSprint,crouch:newCrouch,seq:\+\+stanceSeq\}\)/);
 assert.match(source,/seq=0;stanceSeq=0;lastWorldTick=-1;/);
 assert.doesNotMatch(source,/request\('\/pace',\{sprint:newSprint,crouch:newCrouch,x:/);
});
