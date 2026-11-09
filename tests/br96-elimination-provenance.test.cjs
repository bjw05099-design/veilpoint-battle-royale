'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {BrSquadLobby}=require('../src/br-squad-lobby.cjs');
const {BrSquadWorld,BOUNDARY_GRACE_TICKS}=require('../src/br-squad-world.cjs');
const Panel=require('../src/br96-squad-panel.js');
const token=n=>n.toString(16).padStart(64,'0');
function fullGame(){
 const lobby=new BrSquadLobby();
 for(let i=0;i<96;i++)lobby.join(token(i),'Resident '+i);
 for(let i=0;i<96;i++)lobby.ready(token(i),true);
 const world=new BrSquadWorld(lobby);
 const snapshot=who=>({...lobby.snapshot(who),world:world.snapshot(who)});
 return {world,snapshot};
}
test('96 real-member server differentiates voluntary exit from out-of-area expiry without guessing a disconnect',()=>{
 const {world,snapshot}=fullGame();
 assert.equal(snapshot(token(0)).world.self.eliminationReason,null);
 assert.equal(world.withdraw(token(1)).ok,true);
 assert.equal(world.snapshot(token(1)).self.eliminationReason,'voluntary_withdrawal');
 assert.equal(world.snapshot(token(0)).squad[1].eliminationReason,'voluntary_withdrawal');
 assert.match(Panel.roster(snapshot(token(0))),/2\. Resident 1 · 경기 종료 \(본인 경기 포기\)/);
 const other=world.actors.get(token(2));
 other.x=166;other.z=166;
 other.outsideStreakTicks=BOUNDARY_GRACE_TICKS-1;
 world.step();
 assert.equal(world.snapshot(token(2)).self.eliminationReason,'area_expiry');
 assert.equal(world.snapshot(token(0)).squad[2].eliminationReason,'area_expiry');
 assert.match(Panel.roster(snapshot(token(0))),/3\. Resident 2 · 경기 종료 \(구역 밖 체류 만료\)/);
 const distant=world.snapshot(token(7));
 assert.equal(distant.squad.every(p=>p.id>=7&&p.id<=12),false,
  'IDs are stable roster identifiers, not arbitrary token indexing');
 assert.equal(distant.squad.some(p=>p.id===world.actors.get(token(2)).id),false,
  'opponent retirement reason is never copied into an unrelated squad roster');
 assert.equal(world.actors.get(token(3)).eligible,true);
 assert.equal(world.actors.get(token(3)).eliminationReason,null);
});
test('stale presence is not reported as a game elimination or gameplay reward',()=>{
 const {world,snapshot}=fullGame();
 const me=world.actors.get(token(0));
 me.lastPresenceTick=-1000;
 const s=snapshot(token(0));
 assert.equal(s.world.self.connection,'stale');
 assert.equal(s.world.self.eligible,true);
 assert.equal(s.world.self.eliminationReason,null);
 assert.match(Panel.roster(s),/1\. Resident 0 · 응답 대기/);
 assert.doesNotMatch(Panel.roster(s),/1\. Resident 0 · 경기 종료/);
 world.heartbeat(token(0));
 assert.equal(world.snapshot(token(0)).self.connection,'fresh');
});
test('spectator and reconnect session retain the original server elimination cause',()=>{
 const {world}=fullGame();
 assert.equal(world.withdraw(token(0)).ok,true);
 assert.equal(world.spectate(token(0),{slot:2}).ok,true);
 assert.equal(world.snapshot(token(0)).self.eliminationReason,'voluntary_withdrawal');
 const newToken=token(2048);
 assert.equal(world.rebindSession(token(0),newToken).ok,true);
 assert.equal(world.snapshot(newToken).self.eliminationReason,'voluntary_withdrawal');
 assert.ok(world.snapshot(newToken).spectatorView);
 assert.equal(world.actors.has(token(0)),false);
});
