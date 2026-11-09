'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const Sim=require('../src/simulation.js');
const {BrSquadLobby}=require('../src/br-squad-lobby.cjs');
const {BrSquadWorld}=require('../src/br-squad-world.cjs');
const {createBrSquadServer}=require('../server/br-squad-server.cjs');
const Street=require('../src/br96-street-view.js');
const token=i=>i.toString(16).padStart(64,'0');
function live(){
 const l=new BrSquadLobby();
 for(let i=0;i<96;i++)assert.equal(l.join(token(i),'Visitor '+i).ok,true);
 for(let i=0;i<96;i++)assert.equal(l.ready(token(i),true).ok,true);
 return new BrSquadWorld(l);
}
function nearPublicBench(w,actor){
 const benches=w.obstacles.filter(o=>/^aden-[a-z-]+(?:bench|seat)$/.test(o.type||'')&&o.h<=.85);
 for(const bench of benches){
  const positions=[
   {x:bench.x+bench.w/2+1,z:bench.z},
   {x:bench.x-bench.w/2-1,z:bench.z},
   {x:bench.x,z:bench.z+bench.d/2+1},
   {x:bench.x,z:bench.z-bench.d/2-1}
  ];
  for(const point of positions){
   if(Sim.blocked(point.x,point.z,.85,w.obstacles)||
      Sim.lineBlocked(point.x,point.z,bench.x,bench.z,
        w.obstacles.filter(o=>o!==bench)))continue;
   actor.x=point.x;actor.z=point.z;actor.direction={x:0,z:0};actor.moving=false;
   return {bench,point};
  }
 }
 throw new Error('no physically accessible authored civic bench');
}

test('real 96-body BR has optional bench recovery faster than ordinary rest everywhere',()=>{
 const seated=live(),ordinary=live(),person=token(0);
 const a=seated.actors.get(person),b=ordinary.actors.get(person);
 assert.equal(seated.benchRest(person).reason,'bench_too_far');
 const {point}=nearPublicBench(seated,a);
 b.x=point.x;b.z=point.z;
 a.stamina=30;b.stamina=30;
 const before={x:a.x,z:a.z};
 assert.deepEqual(seated.benchRest(person),{ok:true,seated:true,stamina:30});
 assert.equal(seated.snapshot(person).self.benchResting,true);
 assert.equal(seated.snapshot(token(1)).squad[0].benchResting,true);
 for(let i=0;i<30;i++){seated.step();ordinary.step();}
 assert.ok(seated.snapshot(person).self.stamina>ordinary.snapshot(person).self.stamina);
 assert.deepEqual({x:a.x,z:a.z},before,'sitting must not move a 96-body participant');
 assert.equal(seated.snapshot(person).self.eligible,true);
 assert.equal(seated.benchRest(person).seated,false,'players may stand up at will');
 assert.equal(seated.snapshot(person).self.benchResting,false);
});

test('nonzero server movement automatically stands the player and recovers normally elsewhere',()=>{
 const w=live(),who=token(0),person=w.actors.get(who);
 nearPublicBench(w,person);
 assert.equal(w.benchRest(who).seated,true);
 assert.equal(w.move(who,{seq:1,dx:0,dz:1}).ok,true);
 w.step();
 assert.equal(w.snapshot(who).self.benchResting,false);
 assert.equal(w.benchRest(who).reason,'still_moving');
 assert.equal(w.withdraw(who).ok,true);
 assert.equal(w.benchRest(who).reason,'out_of_round');
 assert.throws(()=>w.benchRest(token(99)),/unknown_session/);
});

test('local BR street view lowers the eye for real seated people and hides occluded ones',()=>{
 const self={id:1,x:0,z:0},resting={...self,benchResting:true};
 const baseline=Street.frame({subject:self});
 const seated=Street.frame({subject:resting});
 assert.equal(seated.eyeHeight,Street.EYE_SEATED);
 assert.ok(seated.eyeHeight<baseline.eyeHeight);
 assert.deepEqual(seated.rays,baseline.rays);
 const wall={x:0,z:-11,w:8,d:2,h:3,type:'building'};
 const model=Street.frame({subject:self,obstacles:[wall],squad:[
  {id:2,slot:2,x:1,z:-5,eligible:true,benchResting:true},
  {id:3,slot:3,x:0,z:-18,eligible:true,benchResting:true}
 ]});
 assert.equal(model.seen.find(p=>p.id===2)?.benchResting,true);
 assert.equal(model.seen.some(p=>p.id===3),false);
});

test('authenticated HTTP only rests beside real public furniture, never a client-selected seat',async()=>{
 const server=createBrSquadServer({port:0,autoTick:false});
 const addr=await server.listen(),base='http://127.0.0.1:'+addr.port;
 const post=async(endpoint,body,auth)=>{
  const res=await fetch(base+endpoint,{method:'POST',headers:{
   'content-type':'application/json',...(auth?{'x-player-token':auth}:{})},
   body:JSON.stringify(body)});
  return {status:res.status,data:await res.json()};
 };
 try{
  assert.equal((await post('/bench-rest',{})).status,401);
  const sessions=[];
  for(let i=0;i<96;i++){const r=await post('/join',{name:'Human '+i});
   assert.equal(r.status,201);sessions.push(r.data.token);}
  for(const tok of sessions)assert.equal((await post('/ready',{ready:true},tok)).status,200);
  assert.equal((await post('/bench-rest',{x:0,z:0},sessions[0])).status,400);
  assert.equal((await post('/bench-rest',{seatId:1},sessions[0])).status,400);
  nearPublicBench(server.world,server.world.actors.get(sessions[0]));
  const result=await post('/bench-rest',{},sessions[0]);
  assert.equal(result.status,200);
  assert.equal(result.data.world.self.benchResting,true);
  assert.equal(JSON.stringify(result.data).includes(sessions[0]),false);
  const mate=server.world.snapshot(sessions[1]);
  assert.equal(mate.squad[0].benchResting,true);
  const stop=await post('/bench-rest',{},sessions[0]);
  assert.equal(stop.status,200);
  assert.equal(stop.data.world.self.benchResting,false);
 }finally{await server.close();}
});

test('PC F context, click and filtered seated street view are connected without navigation unlock',()=>{
 const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
 const html=read('br96.html'),client=read('src/br96-client.js'),
   server=read('server/br-squad-server.cjs');
 assert.match(html,/id="benchRest" disabled/);
 assert.match(client,/key==='KeyF'&&active\(\)/);
 assert.match(client,/command\('\/interact',\{\},null\)/);
 assert.match(client,/el\('benchRest'\)\.addEventListener\('click',benchRest\)/);
 assert.match(server,/url\.pathname==='\/bench-rest'/);
 assert.doesNotMatch(client,/command\('\/bench-rest',\{[^}]+\}/);
});
