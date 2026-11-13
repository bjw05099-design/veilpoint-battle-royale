'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const Sim=require('../src/simulation.js');
const {BrSquadLobby}=require('../src/br-squad-lobby.cjs');
const {BrSquadWorld}=require('../src/br-squad-world.cjs');
const {createBrSquadServer}=require('../server/br-squad-server.cjs');
const Controls=require('../src/desktop-controls.js');
const token=i=>i.toString(16).padStart(64,'0');
const src=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
function live(){
 const l=new BrSquadLobby();
 for(let i=0;i<96;i++)assert.equal(l.join(token(i),'Human '+i).ok,true);
 for(let i=0;i<96;i++)assert.equal(l.ready(token(i),true).ok,true);
 return new BrSquadWorld(l);
}
function byAccessibleBench(w,actor){
 for(const b of w.obstacles.filter(o=>/^aden-[a-z-]+(?:bench|seat)$/.test(o.type||'')&&o.h<=.85)){
  const choices=[
   {x:b.x+b.w/2+1,z:b.z},{x:b.x-b.w/2-1,z:b.z},
   {x:b.x,z:b.z+b.d/2+1},{x:b.x,z:b.z-b.d/2-1}];
  for(const p of choices){
   if(Sim.blocked(p.x,p.z,.85,w.obstacles)||
      Sim.lineBlocked(p.x,p.z,b.x,b.z,w.obstacles.filter(o=>o!==b)))continue;
   actor.x=p.x;actor.z=p.z;actor.moving=false;
   actor.direction={x:0,z:0};
   return;
  }
 }
 throw new Error('no accessible civic bench in authored world');
}
test('F performs a real, local, reversible bench interaction on the 96-seat server',()=>{
 const w=live(),t=token(0),actor=w.actors.get(t);
 assert.equal(w.interactNearby(t).ok,false,'remote objects may not respond');
 byAccessibleBench(w,actor);
 const location={x:actor.x,z:actor.z},stamina=actor.stamina;
 const first=w.interactNearby(t);
 assert.equal(first.ok,true);assert.equal(first.kind,'bench');assert.equal(first.seated,true);
 assert.equal(w.snapshot(t).self.benchResting,true);
 assert.deepEqual({x:actor.x,z:actor.z},location);
 assert.equal(actor.stamina,stamina);
 const second=w.interactNearby(t);
 assert.equal(second.kind,'bench');assert.equal(second.seated,false);
 assert.equal(w.snapshot(t).self.benchResting,false);
 actor.x=166;actor.z=166;
 assert.equal(w.interactNearby(t).reason,'no_reachable_interaction');
 assert.throws(()=>w.interactNearby(token(98)),/unknown_session/);
});
test('context endpoint rejects forged actions and reads only a real authenticated seat',async()=>{
 const server=createBrSquadServer({port:0,autoTick:false});
 const a=await server.listen(),base='http://127.0.0.1:'+a.port;
 async function post(path,body,auth){
  const response=await fetch(base+path,{method:'POST',
   headers:{'content-type':'application/json',...(auth?{'x-player-token':auth}:{})},
   body:JSON.stringify(body)});
  return {status:response.status,body:await response.json()};
 }
 try{
  assert.equal((await post('/interact',{})).status,401);
  const sessions=[];
  for(let i=0;i<96;i++){
   const joined=await post('/join',{name:'Player '+i});
   assert.equal(joined.status,201);sessions.push(joined.body.token);
  }
  for(const t of sessions)assert.equal((await post('/ready',{ready:true},t)).status,200);
  assert.equal((await post('/interact',{kind:'gate'},sessions[0])).status,400);
  assert.equal((await post('/interact',{x:0,z:0},sessions[0])).status,400);
  assert.equal((await post('/interact',{},sessions[0])).status,409);
  byAccessibleBench(server.world,server.world.actors.get(sessions[0]));
  const response=await post('/interact',{},sessions[0]);
  assert.equal(response.status,200);
  assert.equal(response.body.kind,'bench');
  assert.equal(response.body.world.self.benchResting,true);
  assert.equal(JSON.stringify(response.body).includes(sessions[0]),false);
 }finally{await server.close();}
});
test('F is contextual in BR96, in CH01 remapping and UE5; middle click marks position',()=>{
 const br=src('src/br96-client.js'),html=src('br96.html');
 const native=src('Unreal/Veilpoint/Config/DefaultInput.ini');
 const story=src('src/story-app.js');
 assert.match(br,/key==='KeyF'&&active\(\)/);
 assert.match(br,/command\('\/interact',\{\},null\)/);
 assert.match(br,/canvas\.addEventListener\('mousedown',event=>/);
 assert.match(br,/if\(event\.button!==1\)return;/);
 assert.match(br,/signal\('location'\);/);
 assert.doesNotMatch(br,/key==='KeyE'&&active\(\)/);
 assert.match(br,/key==='KeyR'&&active\(\)\)\{event.preventDefault\(\);void weaponAction\('reload'\)/,
  'R reloads the real finite weapon; it is not a second interaction binding');
 assert.doesNotMatch(br,/key==='KeyT'&&active\(\)/);
 assert.match(html,/휠 클릭 · 위치 표시/);
 assert.match(html,/F 주변 상호작용/);
 assert.doesNotMatch(html,/E 현재 위치 표시/);
 assert.match(native,/ActionName="Interact",Key=F/);
 assert.match(native,/ActionName="FieldLight",Key=L/);
 assert.match(story,/action==='interact'/);
 assert.equal(Controls.actionFor('KeyF',Controls.normalize({})),'interact');
 assert.equal(Controls.actionFor('KeyE',Controls.normalize({})),null);
 const old={...Controls.DEFAULT_BINDINGS,interact:'KeyE'};
 assert.equal(Controls.normalize({bindings:old}).bindings.interact,'KeyF');
 assert.ok(!br.includes("'공공 벤치 휴식: '"),
  'bench rest time remains available for server audit but is absent from the final screen');
});
