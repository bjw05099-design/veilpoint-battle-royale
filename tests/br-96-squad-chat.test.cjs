'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {BrSquadLobby}=require('../src/br-squad-lobby.cjs');
const {BrSquadWorld}=require('../src/br-squad-world.cjs');
const {createBrSquadServer}=require('../server/br-squad-server.cjs');
const token=i=>i.toString(16).padStart(64,'0');
function launch(){
 const lobby=new BrSquadLobby();
 for(let i=0;i<96;i++)lobby.join(token(i),'Participant '+i);
 for(let i=0;i<96;i++)lobby.ready(token(i),true);
 return new BrSquadWorld(lobby);
}
test('server-owned six-person radio chat never leaks to other real squads and has bounded messages',()=>{
 const world=launch();
 assert.equal(world.chat(token(0),'잠시 이곳에서 합류하겠습니다.').ok,true);
 assert.deepEqual(world.snapshot(token(1)).squadChat.map(m=>m.text),
   ['잠시 이곳에서 합류하겠습니다.']);
 assert.deepEqual(world.snapshot(token(6)).squadChat,[]);
 assert.equal(world.chat(token(0),'too fast').reason,'chat_cooldown');
 assert.equal(world.chat(token(0),'\nnew line').reason,'invalid_chat');
 assert.equal(world.chat(token(0),'x'.repeat(97)).reason,'invalid_chat');
 assert.equal(world.chat(token(0),'  spaced  ').reason,'invalid_chat');
 assert.equal(world.snapshot(token(1)).squadChat[0].slot,1);
 assert.equal(JSON.stringify(world.snapshot(token(1)).squadChat).includes(token(0)),false);
 for(let i=0;i<7;i++){
   world.tick+=180;
   assert.equal(world.chat(token(0),'다음 메시지 '+i).ok,true);
 }
 const history=world.snapshot(token(2)).squadChat;
 assert.equal(history.length,6,'only the most recent six messages are retained');
 assert.equal(history[0].text,'다음 메시지 1');
 assert.equal(history.at(-1).text,'다음 메시지 6');
 assert.deepEqual(world.snapshot(token(6)).squadChat,[]);
 assert.equal(world.withdraw(token(0)).ok,true);
 assert.equal(world.chat(token(0),'now excluded').reason,'out_of_round');
});
test('local HTTP chat authenticates 96-seat membership and refuses user-selected recipients or spoofed authors',async()=>{
 const server=createBrSquadServer({port:0,autoTick:false});
 const addr=await server.listen(),base='http://127.0.0.1:'+addr.port;
 const post=async(route,body,auth)=>{
  const r=await fetch(base+route,{method:'POST',headers:{
    'content-type':'application/json',...(auth?{'x-player-token':auth}:{})},
    body:JSON.stringify(body)});
  return {status:r.status,data:await r.json()};
 };
 try{
  assert.equal((await post('/squad-chat',{text:'hello'})).status,401);
  const sessions=[];
  for(let i=0;i<96;i++){
   const join=await post('/join',{name:'Player '+i});
   assert.equal(join.status,201);sessions.push(join.data.token);
  }
  for(const t of sessions)assert.equal((await post('/ready',{ready:true},t)).status,200);
  assert.equal((await post('/squad-chat',{text:'hello',team:2},sessions[0])).status,400);
  assert.equal((await post('/squad-chat',{text:123},sessions[0])).status,400);
  const sent=await post('/squad-chat',{text:'분대 통신 테스트'},sessions[0]);
  assert.equal(sent.status,200);
  assert.equal(sent.data.world.squadChat[0].text,'분대 통신 테스트');
  assert.equal(JSON.stringify(sent.data).includes(sessions[0]),false);
  const own=await fetch(base+'/world',{headers:{'x-player-token':sessions[1]}}).then(r=>r.json());
  const foreign=await fetch(base+'/world',{headers:{'x-player-token':sessions[6]}}).then(r=>r.json());
  assert.equal(own.squadChat[0].text,'분대 통신 테스트');
  assert.deepEqual(foreign.squadChat,[]);
  assert.equal((await post('/squad-chat',{text:'second'},sessions[0])).status,409,
    'server enforces a fixed-step sending interval without using client time');
 }finally{await server.close();}
});
