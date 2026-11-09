'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {BrSquadLobby}=require('../src/br-squad-lobby.cjs');
const {BrSquadWorld}=require('../src/br-squad-world.cjs');
const {createBrSquadServer}=require('../server/br-squad-server.cjs');
const Street=require('../src/br96-street-view.js');
const token=n=>n.toString(16).padStart(64,'0');
function live(){
 const lobby=new BrSquadLobby();
 for(let i=0;i<96;i++)assert.equal(lobby.join(token(i),'Player '+i).ok,true);
 for(let i=0;i<96;i++)assert.equal(lobby.ready(token(i),true).ok,true);
 return new BrSquadWorld(lobby);
}

test('a real human hand signal is server-timed and never grants points, movement or hidden positions',()=>{
 const w=live(),a=w.snapshot(token(0)),b=w.snapshot(token(1));
 assert.equal(a.self.waving,false);
 assert.equal(w.wave(token(0)).ok,true);
 assert.equal(w.snapshot(token(0)).self.waving,true);
 assert.equal(w.snapshot(token(1)).squad[0].waving,true);
 const squadmateAfter=w.snapshot(token(1)).self;
 assert.deepEqual([squadmateAfter.x,squadmateAfter.z,squadmateAfter.stamina],
  [b.self.x,b.self.z,b.self.stamina]);
 assert.deepEqual([w.snapshot(token(0)).self.x,w.snapshot(token(0)).self.z],
  [a.self.x,a.self.z]);
 assert.equal(w.wave(token(0)).reason,'wave_cooldown');
 assert.throws(()=>w.wave(token(98)),/unknown_session/,'only the 96 real seats can perform gestures');
});

test('raised hand lasts precisely two seconds, cannot be invoked after leaving',()=>{
 const w=live(),own=token(0);
 assert.equal(w.wave(own).ok,true);
 for(let i=0;i<119;i++)w.step();
 assert.equal(w.snapshot(own).self.waving,true);
 w.step();
 assert.equal(w.snapshot(own).self.waving,false);
 assert.equal(w.wave(own).reason,'wave_cooldown');
 for(let i=0;i<180;i++)w.step();
 assert.equal(w.wave(own).ok,true);
 assert.equal(w.withdraw(own).ok,true);
 assert.equal(w.snapshot(own).self.waving,false,'a retired body never displays a moving gesture');
 assert.equal(w.wave(own).reason,'out_of_round');
});

test('street view renders only authenticated, in-FOV and unoccluded waving people',()=>{
 const input={subject:{id:1,x:0,z:0},yaw:0,
  squad:[{id:2,slot:2,x:1,z:-5,eligible:true,waving:true},
    {id:3,slot:3,x:0,z:-19,eligible:true,waving:true}],
  visible:[{id:91,x:5,z:-5,waving:true}],obstacles:[
    {x:0,z:-11,w:8,d:2,h:3,type:'building'}]};
 const source=JSON.stringify(input),model=Street.frame(input);
 assert.equal(model.seen.find(x=>x.id===2)?.waving,true);
 assert.equal(model.seen.find(x=>x.id===3),undefined,'a wall blocks unseen waving bodies');
 assert.ok(model.seen.every(x=>x.id!==3));
 assert.equal(JSON.stringify(input),source,'rendering cannot modify filtered server data');
 const rectangles=[];
 const ctx={
  fillRect(...v){rectangles.push(v);},fillText(){},beginPath(){},moveTo(){},lineTo(){},stroke(){}
 };
 Street.draw(ctx,{...input,width:700,height:480});
 const yes=rectangles.length;
 const noArgs={...input,squad:input.squad.map(p=>({...p,waving:false})),
  visible:input.visible.map(p=>({...p,waving:false}))};
 rectangles.length=0;Street.draw(ctx,{...noArgs,width:700,height:480});
 assert.ok(yes>rectangles.length,'one raised arm adds visible real-scale screen geometry');
});

test('PC B and button call the authenticated, targetless HTTP gesture route',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../br96.html'),'utf8');
 const client=fs.readFileSync(path.join(__dirname,'../src/br96-client.js'),'utf8');
 const server=fs.readFileSync(path.join(__dirname,'../server/br-squad-server.cjs'),'utf8');
 assert.match(html,/id="wave" disabled/);
 assert.match(client,/key==='KeyB'&&active\(\)/);
 assert.match(client,/command\('\/wave',\{\},null\)/);
 assert.match(server,/url\.pathname==='\/wave'/);
 assert.match(server,/Object\.keys\(body\)\.length!==0/);
 assert.doesNotMatch(client,/command\('\/wave',\{[\s\S]{0,80}(?:target|position|x:)/);
});

test('BR96 HTTP gesture refuses missing tokens and forged target coordinates',async()=>{
 const server=createBrSquadServer({port:0,autoTick:false});
 const addr=await server.listen(),base='http://127.0.0.1:'+addr.port;
 async function post(route,body,auth){
  const res=await fetch(base+route,{method:'POST',headers:{
   'content-type':'application/json',...(auth?{'x-player-token':auth}:{})},
   body:JSON.stringify(body)});
  return {status:res.status,data:await res.json()};
 }
 try{
  assert.equal((await post('/wave',{})).status,401);
  const sessions=[];
  for(let i=0;i<96;i++){const r=await post('/join',{name:'Guest '+i});
   assert.equal(r.status,201);sessions.push(r.data.token);}
  for(const t of sessions)assert.equal((await post('/ready',{ready:true},t)).status,200);
  assert.equal((await post('/wave',{target:'all'},sessions[0])).status,400);
  assert.equal((await post('/wave',{x:100,z:100},sessions[0])).status,400);
  const acknowledged=await post('/wave',{},sessions[0]);
  assert.equal(acknowledged.status,200);
  assert.equal(acknowledged.data.world.self.waving,true);
  assert.equal((await post('/wave',{},sessions[0])).status,409);
  assert.equal(JSON.stringify(acknowledged.data).includes(sessions[0]),false);
 }finally{await server.close();}
});
