'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {BrSquadLobby}=require('../src/br-squad-lobby.cjs');
const {createBrSquadServer}=require('../server/br-squad-server.cjs');
const token=i=>i.toString(16).padStart(64,'0');

test('96-seat staging chat is private, rate-limited and removed on departure',()=>{
 const lobby=new BrSquadLobby();
 for(let i=0;i<7;i++)assert.equal(lobby.join(token(i),'Player '+i).ok,true);
 assert.equal(lobby.chat(token(0),'먼저 인사할게요.',1000).ok,true);
 assert.deepEqual(lobby.snapshot(token(1)).lobbyChat.map(x=>x.text),['먼저 인사할게요.']);
 assert.deepEqual(lobby.snapshot(token(6)).lobbyChat,[]);
 assert.equal(lobby.chat(token(0),'빠른 재전송',2000).reason,'chat_cooldown');
 assert.equal(lobby.chat(token(0),'\ncommand',5000).reason,'invalid_chat');
 assert.equal(lobby.chat(token(0),'  공백  ',5000).reason,'invalid_chat');
 assert.equal(lobby.chat(token(0),'가'.repeat(97),5000).reason,'invalid_chat');
 assert.equal(lobby.chat(token(0),'같은 분대만 확인',5000).ok,true);
 assert.equal(JSON.stringify(lobby.snapshot(token(1))).includes(token(0)),false);
 assert.equal(lobby.snapshot(token(1)).lobbyChat.length,2);
 assert.equal(lobby.leave(token(0)).ok,true);
 assert.deepEqual(lobby.snapshot(token(1)).lobbyChat,[]);
 assert.throws(()=>lobby.chat(token(0),'떠난 사람'),/unknown_session/);
});
test('staging history never leaks to other squads and locks when all real humans are ready',()=>{
 const lobby=new BrSquadLobby();
 for(let i=0;i<96;i++)lobby.join(token(i),'Player '+i);
 for(let i=0;i<8;i++)assert.equal(lobby.chat(token(0),'메시지 '+i,4000+i*3000).ok,true);
 assert.equal(lobby.snapshot(token(2)).lobbyChat.length,6);
 assert.equal(lobby.snapshot(token(2)).lobbyChat[0].text,'메시지 2');
 assert.deepEqual(lobby.snapshot(token(6)).lobbyChat,[]);
 for(let i=0;i<96;i++)lobby.ready(token(i),true);
 assert.equal(lobby.phase,'roster_locked');
 assert.deepEqual(lobby.snapshot(token(2)).lobbyChat,[]);
 assert.equal(lobby.chat(token(0),'시작 후 대기실 메시지').reason,'roster_locked');
});

test('loopback HTTP permits authenticated 6-player pre-match chat but no opponent or client-selected recipient',async()=>{
 const host=createBrSquadServer({port:0,autoTick:false});
 const addr=await host.listen(),base='http://127.0.0.1:'+addr.port;
 const post=async(route,body,auth)=>{
   const r=await fetch(base+route,{method:'POST',headers:{
     'content-type':'application/json',...(auth?{'x-player-token':auth}:{})},
     body:JSON.stringify(body)});
   return {status:r.status,data:await r.json()};
 };
 const state=async auth=>fetch(base+'/state',{headers:{'x-player-token':auth}}).then(q=>q.json());
 try{
   assert.equal((await post('/squad-chat',{text:'hello'})).status,401);
   const tokens=[];
   for(let i=0;i<7;i++)tokens.push((await post('/join',{name:'Player '+i})).data.token);
   assert.equal((await post('/squad-chat',{text:'hello',team:2},tokens[0])).status,400);
   const sent=await post('/squad-chat',{text:'합류 준비 중입니다.'},tokens[0]);
   assert.equal(sent.status,200);
   assert.equal(sent.data.state.lobbyChat[0].text,'합류 준비 중입니다.');
   assert.equal((await state(tokens[1])).lobbyChat[0].slot,1);
   assert.deepEqual((await state(tokens[6])).lobbyChat,[]);
   assert.equal(JSON.stringify(sent.data).includes(tokens[0]),false);
   assert.equal((await post('/squad-chat',{text:'연속 전송'},tokens[0])).status,409);
   assert.equal((await post('/leave',{},tokens[0])).status,200);
   assert.deepEqual((await state(tokens[1])).lobbyChat,[]);
 }finally{await host.close();}
});
test('PC client lets humans type in prelaunch squad lobby without movement input or unsafe HTML',()=>{
 const root=path.resolve(__dirname,'..');
 const client=fs.readFileSync(path.join(root,'src/br96-client.js'),'utf8');
 const page=fs.readFileSync(path.join(root,'br96.html'),'utf8');
 assert.match(client,/const canChat=!!token&&\(state\?\.phase==='assembling'\|\|active\(\)\)/);
 assert.match(client,/state\?\.phase==='assembling'\?state\?\.lobbyChat:w\?\.squadChat/);
 assert.match(client,/const messages=state\?\.phase==='assembling'/);
 assert.match(client,/event\.preventDefault\(\);sendSquadChat\(\)/);
 assert.match(page,/id="squadChatInput"/);
 assert.doesNotMatch(client,/innerHTML\s*=/);
});
