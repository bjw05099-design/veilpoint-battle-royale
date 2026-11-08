'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {BrSquadLobby}=require('../src/br-squad-lobby.cjs');
const {BrSquadWorld}=require('../src/br-squad-world.cjs');
const token=i=>i.toString(16).padStart(64,'0');
const source=filename=>fs.readFileSync(path.resolve(__dirname,'..',filename),'utf8');
function started(){
 const lobby=new BrSquadLobby();
 for(let i=0;i<96;i++)lobby.join(token(i),'Human '+i);
 for(let i=0;i<96;i++)lobby.ready(token(i),true);
 return new BrSquadWorld(lobby);
}
test('N-key control reuses authenticated, observer-only squad slots; original text input and scoreboard still take priority',()=>{
 const js=source('src/br96-client.js'),html=source('br96.html');
 assert.match(js,/async function cycleSpectator\(\)/);
 assert.match(js,/w\.squad\.filter\(p=>p\.eligible&&p\.id!==w\.self\.id\)/);
 assert.match(js,/\.sort\(\(a,b\)=>a-b\)/);
 assert.match(js,/eligible\.find\(slot=>slot>current\)\|\|eligible\[0\]/);
 assert.match(js,/command\('\/spectate',\{slot:next\},null\)/);
 assert.match(js,/key==='KeyN'&&currentWorld\(\)&&!currentWorld\(\)\.self\.eligible/);
 assert.ok(js.indexOf("if(!canUseKeyboard(event))return;")<
   js.indexOf("key==='KeyN'"),'typing in the chat or selector cannot switch cameras');
 assert.ok(js.indexOf("if(!el('standingsPanel').hidden){")<
   js.indexOf("key==='KeyN'"),'scoreboard keyboard focus remains authoritative');
 assert.match(html,/N으로 다음 분대원/);
 assert.doesNotMatch(js,/command\('\/spectate',\{slot:next,x:/);
});
test('cycling human observers cannot follow an opponent or respawn an eliminated player',()=>{
 const w=started(),viewer=token(0);
 assert.deepEqual(w.spectate(viewer,{slot:2}),{ok:false,reason:'spectating_unavailable'});
 assert.equal(w.withdraw(viewer).ok,true);
 for(const slot of [2,3,4,5,6,2]){
  assert.equal(w.spectate(viewer,{slot}).ok,true);
  const watched=w.snapshot(viewer);
  assert.equal(watched.spectatorView.slot,slot);
  assert.equal(watched.self.eligible,false);
  assert.deepEqual(watched.visible,w.snapshot(token(slot-1)).visible);
  assert.equal(JSON.stringify(watched).includes(token(6)),false,
   'rival session secrets are never included');
 }
 assert.throws(()=>w.spectate(viewer,{slot:7}),/invalid_spectator_slot/);
 assert.throws(()=>w.spectate(viewer,{slot:3,x:999}),/invalid_spectator_slot/);
 const rival=w.snapshot(token(6));
 assert.equal(rival.spectatorView,null);
 w.withdraw(token(2));
 assert.equal(w.spectate(viewer,{slot:3}).reason,'teammate_unavailable');
 assert.equal(w.snapshot(viewer).self.eligible,false);
});
