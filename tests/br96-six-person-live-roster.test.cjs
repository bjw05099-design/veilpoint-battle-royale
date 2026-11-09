'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {BrSquadLobby}=require('../src/br-squad-lobby.cjs');
const {BrSquadWorld}=require('../src/br-squad-world.cjs');
const Panel=require('../src/br96-squad-panel.js');
const {createBrSquadServer}=require('../server/br-squad-server.cjs');
const token=n=>n.toString(16).padStart(64,'0');
function game(){
 const lobby=new BrSquadLobby();
 for(let i=0;i<96;i++)lobby.join(token(i),'Resident '+i);
 const before=Panel.roster(lobby.snapshot(token(0)));
 for(let i=0;i<96;i++)lobby.ready(token(i),true);
 const world=new BrSquadWorld(lobby);
 const snapshot=who=>({...lobby.snapshot(who),world:world.snapshot(who)});
 return {lobby,world,snapshot,before};
}
test('live BR96 roster shows six genuine same-squad seats, server eligibility and stale network safely',()=>{
 const {world,snapshot,before}=game();
 assert.match(before,/우리 분대 · 준비 명단/);
 assert.match(before,/Resident 0/);
 assert.doesNotMatch(before,/Resident 6/);
 const initial=Panel.roster(snapshot(token(0)));
 assert.equal(initial.split('\n').length,7);
 assert.match(initial,/우리 분대 · 실시간 참가 상태/);
 assert.match(initial,/1\. Resident 0 · 참가 중/);
 assert.doesNotMatch(initial,/Resident 6|준비$/m);
 const competitor=world.actors.get(token(1));
 competitor.lastPresenceTick=-1000;
 const stale=Panel.roster(snapshot(token(0)));
 assert.match(stale,/2\. Resident 1 · 응답 대기/);
 assert.doesNotMatch(stale,/퇴장|탈락|접속 끊김/);
 assert.equal(world.withdraw(token(1)).ok,true);
 const ended=Panel.roster(snapshot(token(0)));
 assert.match(ended,/2\. Resident 1 · 경기 종료/);
 assert.doesNotMatch(ended,/Resident 6/);
 const sourceState=snapshot(token(0)),copy=JSON.stringify(sourceState);
 Panel.roster(sourceState);
 assert.equal(JSON.stringify(sourceState),copy,'view must not update server state');
});
test('missing authenticated member snapshot never invents opponent identity or eligibility',()=>{
 const {snapshot}=game(),state=snapshot(token(0));
 state.world.squad.splice(1,1);
 const printed=Panel.roster(state);
 assert.match(printed,/2\. Resident 1 · 상태 확인 중/);
 assert.doesNotMatch(printed,/2\. Resident 1 · 경기 종료/);
 state.world={mode:'unsupported',squad:[]};
 assert.match(Panel.roster(state),/준비 명단/);
 assert.equal(Panel.roster(null),'분대 대기 중');
 assert.equal(Panel.COUNT,6);
});
test('loopback server serves own-squad formatter with CSP and no session secrets',async()=>{
 const host=createBrSquadServer({port:0,autoTick:false});
 const addr=await host.listen(),base='http://127.0.0.1:'+addr.port;
 try{
  const html=await fetch(base+'/');
  assert.equal(html.status,200);
  assert.match(html.headers.get('content-security-policy'),/script-src 'self'/);
  const page=await html.text();
  assert.ok(page.indexOf('/br96-squad-panel.js')<page.indexOf('/br96-client.js'));
  const asset=await fetch(base+'/br96-squad-panel.js');
  assert.equal(asset.status,200);
  assert.match(asset.headers.get('content-type'),/text\/javascript/);
  const source=await asset.text();
  assert.doesNotThrow(()=>new Function(source));
  assert.doesNotMatch(source,/fetch\(|WebSocket|XMLHttpRequest|sessionStorage|localStorage/);
  assert.equal((await fetch(base+'/br96-squad-panel.js?token=untrusted')).status,400);
  const client=fs.readFileSync(path.resolve(__dirname,'../src/br96-client.js'),'utf8');
  assert.match(client,/squadPanel\?\.roster\(state\)/);
  assert.match(client,/el\('roster'\)\.textContent/);
  assert.doesNotMatch(client,/innerHTML\s*=/);
 }finally{await host.close();}
});
