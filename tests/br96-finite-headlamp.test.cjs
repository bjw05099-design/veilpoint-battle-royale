'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {BrSquadLobby}=require('../src/br-squad-lobby.cjs');
const {BrSquadWorld,HEADLAMP_TICKS}=require('../src/br-squad-world.cjs');
const Street=require('../src/br96-street-view.js');
const {createBrSquadServer}=require('../server/br-squad-server.cjs');
const token=i=>i.toString(16).padStart(64,'0');
function match(){
 const lobby=new BrSquadLobby();
 for(let i=0;i<96;i++)assert.equal(lobby.join(token(i),'Human '+i).ok,true);
 for(let i=0;i<96;i++)lobby.ready(token(i),true);
 return new BrSquadWorld(lobby);
}
test('96 independent real participant batteries advance only on authoritative 60Hz ticks',()=>{
 const w=match(),a=token(0),mate=token(1),other=token(6);
 assert.equal(w.snapshot(a).self.headlampOn,false);
 assert.equal(w.snapshot(a).self.headlampTicks,HEADLAMP_TICKS);
 assert.deepEqual(w.headlamp(a),{ok:true,on:true,ticks:HEADLAMP_TICKS});
 assert.equal(w.snapshot(mate).squad.find(p=>p.id===w.actors.get(a).id).headlampOn,true);
 assert.equal(w.snapshot(other).squad.some(p=>p.id===w.actors.get(a).id),false);
 w.step();w.step();
 assert.equal(w.snapshot(a).self.headlampTicks,HEADLAMP_TICKS-2);
 assert.equal(w.snapshot(a).self.headlampOn,true);
 assert.deepEqual(w.headlamp(a),{ok:true,on:false,ticks:HEADLAMP_TICKS-2});
 for(let i=0;i<60;i++)w.step();
 assert.equal(w.snapshot(a).self.headlampTicks,HEADLAMP_TICKS-2,
   'a lamp switched off never burns battery because the client renders more frames');
 assert.equal(w.snapshot(mate).self.headlampTicks,HEADLAMP_TICKS,
   'another real human never shares a battery by default');
 w.actors.get(a).headlampTicks=1;
 assert.equal(w.headlamp(a).on,true);w.step();
 assert.deepEqual([w.snapshot(a).self.headlampOn,w.snapshot(a).self.headlampTicks],[false,0]);
 assert.deepEqual(w.headlamp(a),{ok:false,reason:'battery_empty'});
});
test('retired or invalid sessions cannot fake renewed headlamp or read unobserved opponent',()=>{
 const w=match(),a=token(0);
 assert.throws(()=>w.headlamp('bad'),/unknown_session/);
 assert.equal(w.headlamp(a).on,true);
 assert.equal(w.withdraw(a).ok,true);
 assert.equal(w.snapshot(a).self.headlampOn,false);
 assert.equal(w.headlamp(a).reason,'out_of_round');
 const rival=token(6),viewer=w.snapshot(rival);
 assert.ok(viewer.squad.every(m=>m.id!==w.actors.get(a).id));
 assert.ok(viewer.visible.every(m=>typeof m.headlampOn==='boolean'));
 const replacement=token(1000);
 assert.equal(w.rebindSession(a,replacement).ok,true);
 assert.equal(w.snapshot(replacement).self.headlampOn,false);
});
test('street lamp brightens actual near walls only; it never creates rivals or modifies world',()=>{
 const arg={subject:{id:1,x:0,z:0,headlampOn:true},yaw:0,
  obstacles:[{x:0,z:-9,w:5,d:2,h:3,type:'building'}],
  squad:[],visible:[{id:7,x:0,z:-19}],visibilityMeters:50};
 const frame=Street.frame(arg);
 assert.equal(frame.seen.some(p=>p.id===7),false);
 assert.equal(Street.shade('building',8,95,'clear',false)!==
   Street.shade('building',8,95,'clear',true),true);
 assert.equal(Street.shade('building',27,95,'clear',false),
   Street.shade('building',27,95,'clear',true));
 const fills=[];
 const ctx=new Proxy({},{
  get(_t,key){if(key==='fillRect')return (...a)=>fills.push(a);
   if(['beginPath','moveTo','lineTo','stroke','fillText'].includes(key))return ()=>{};},
  set(){return true;}
 });
 const original=JSON.stringify(arg);
 Street.draw(ctx,{width:700,height:460,...arg});
 assert.ok(fills.length>10);
 assert.equal(JSON.stringify(arg),original);
});
test('BR96 desktop control and HTTP handler reject unauthenticated or spoofed power requests',async()=>{
 const src=fs.readFileSync(path.resolve(__dirname,'../src/br96-client.js'),'utf8');
 assert.match(src,/key==='KeyH'&&active\(\)/);
 assert.match(src,/command\('\/headlamp',\{\},null\)/);
 assert.doesNotMatch(src,/headlampTicks\s*=/);
 const server=createBrSquadServer({port:0,autoTick:false});
 const addr=await server.listen();
 try{
  const base='http://127.0.0.1:'+addr.port;
  const html=await fetch(base+'/').then(v=>v.text());
  assert.match(html,/id="headlamp" disabled aria-pressed="false"/);
  const r=await fetch(base+'/headlamp',{method:'POST',
   headers:{'content-type':'application/json'},body:'{}'});
  assert.notEqual(r.status,200,'anonymous action never controls another participant');
 }finally{await server.close();}
});
