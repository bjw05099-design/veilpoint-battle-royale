'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {BrSquadLobby}=require('../src/br-squad-lobby.cjs');
const {BrSquadWorld}=require('../src/br-squad-world.cjs');
const {createBrSquadServer}=require('../server/br-squad-server.cjs');
const token=n=>n.toString(16).padStart(64,'0');
function fullWorld(){
 const lobby=new BrSquadLobby();
 for(let i=0;i<96;i++)lobby.join(token(i),'Human '+i);
 for(let i=0;i<96;i++)lobby.ready(token(i),true);
 return new BrSquadWorld(lobby);
}
test('96-player server rebind preserves body and score but rejects all pre-reconnect held movement',()=>{
 const world=fullWorld(),beforeToken=token(0),afterToken='e'.repeat(64);
 const body=world.actors.get(beforeToken);
 body.x=0;body.z=0;
 assert.equal(world.move(beforeToken,{dx:1,dz:0,seq:3}).ok,true);
 assert.equal(world.pace(beforeToken,{sprint:true}).ok,true);
 world.step();
 const prior={x:body.x,z:body.z,stamina:body.stamina,seq:body.seq,tick:world.tick,
  team:body.team,slot:body.slot,traveledMeters:body.traveledMeters};
 world.handcart.operator=body;
 assert.equal(world.rebindSession(beforeToken,afterToken).ok,true);
 assert.equal(world.handcart.operator,null,'the old session may no longer steer a shared world prop');
 assert.equal(body.sprintHeld,false);
 assert.equal(body.stepping,null);
 assert.equal(body.direction.x,0);
 assert.equal(body.seq,prior.seq,'reconnect cannot replay a stale input number');
 assert.throws(()=>world.snapshot(beforeToken),/unknown_session/);
 for(let i=0;i<12;i++)world.step();
 assert.equal(body.x,prior.x);
 assert.equal(body.z,prior.z);
 assert.equal(body.stamina>=prior.stamina,true,'past fatigue persists and naturally recovers');
 assert.equal(body.traveledMeters,prior.traveledMeters,'an old network command adds no ghost travel');
 assert.equal(body.team,prior.team);
 assert.equal(body.slot,prior.slot);
 assert.equal(world.snapshot(afterToken).self.eligible,true);
 assert.equal(world.move(afterToken,{dx:1,dz:0,seq:3}).reason,'stale_input');
 assert.equal(world.move(afterToken,{dx:1,dz:0,seq:4}).ok,true);
 world.step();
 assert.ok(body.x>prior.x,'a NEW authenticated command resumes genuine 60Hz movement');
 assert.equal(world.actors.size,96);
});
test('real HTTP resume replaces a human session without ghost motion and keeps the six-person squad',async()=>{
 const server=createBrSquadServer({port:0,autoTick:false});
 const addr=await server.listen(),base='http://127.0.0.1:'+addr.port;
 const post=async(route,data,session)=>{
  const res=await fetch(base+route,{method:'POST',headers:{'content-type':'application/json',...(session?{'x-player-token':session}:{})},body:JSON.stringify(data)});
  return {status:res.status,data:await res.json()};
 };
 try {
  const tokens=[];
  for(let n=0;n<96;n++){
   const joined=await post('/join',{name:'Player '+n});
   assert.equal(joined.status,201);tokens.push(joined.data.token);
  }
  for(const key of tokens)assert.equal((await post('/ready',{ready:true},key)).status,200);
  const world=server.world,body=world.actors.get(tokens[0]);
  body.x=0;body.z=0;
  assert.equal((await post('/move',{dx:1,dz:0,seq:3},tokens[0])).status,200);
  world.step();
  const lastX=body.x,lastZ=body.z;
  const resumed=await post('/resume-session',{},tokens[0]);
  assert.equal(resumed.status,200);
  assert.notEqual(resumed.data.token,tokens[0]);
  assert.equal(resumed.data.state.world.self.slot,1);
  assert.equal(resumed.data.state.world.self.squad,1);
  assert.equal(resumed.data.state.world.self.seq,3);
  assert.equal((await post('/move',{dx:1,dz:0,seq:4},tokens[0])).status,401);
  for(let i=0;i<10;i++)world.step();
  assert.equal(body.x,lastX);
  assert.equal(body.z,lastZ);
  assert.equal((await post('/move',{dx:1,dz:0,seq:4},resumed.data.token)).status,200);
  world.step();
  assert.ok(body.x>lastX);
  assert.equal(server.world.actors.size,96);
 }finally{await server.close();}
});

test('reconnection keeps an already accepted physical bench passage from freezing inside a collider',()=>{
 const world=fullWorld(),old=token(0),newSession='d'.repeat(64);
 const bench={x:0,z:0,w:3.5,d:.7,h:.75,type:'aden-market-court-bench'};
 world.obstacles.push(bench);
 const actor=world.actors.get(old);
 actor.x=0;actor.z=2;
 assert.equal(world.move(old,{dx:0,dz:-1,seq:1}).ok,true);
 assert.equal(world.stepOver(old).ok,true);
 for(let i=0;i<24;i++)world.step();
 assert.ok(actor.stepping && actor.stepping.progress>0);
 const mid=actor.z,progress=actor.stepping.progress;
 world.rebindSession(old,newSession);
 assert.equal(actor.stepping.progress,progress,'old authorized crossing cannot be erased mid-body');
 for(let i=24;i<48;i++)world.step();
 assert.equal(actor.stepping,null);
 assert.ok(actor.z<-1.35&&actor.z<mid);
 assert.equal(world.snapshot(newSession).self.stepOverProgress,null);
 assert.equal(world.snapshot(newSession).self.seq,1);
 assert.equal(world.actors.size,96);
});
