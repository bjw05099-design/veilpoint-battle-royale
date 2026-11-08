'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {BrSquadLobby}=require('../src/br-squad-lobby.cjs');
const {BrSquadWorld}=require('../src/br-squad-world.cjs');
const token=i=>i.toString(16).padStart(64,'0');
function started(){
 const lobby=new BrSquadLobby();
 for(let i=0;i<96;i++)lobby.join(token(i),'Viewer '+i);
 for(let i=0;i<96;i++)lobby.ready(token(i),true);
 return new BrSquadWorld(lobby);
}
test('only withdrawn squad members may watch an eligible teammate, never author a camera pose',()=>{
 const w=started(),viewer=token(0),mate=token(1);
 assert.equal(w.snapshot(viewer).spectatorView,null);
 assert.deepEqual(w.spectate(viewer,{slot:2}),{ok:false,reason:'spectating_unavailable'});
 assert.throws(()=>w.spectate(viewer,{slot:7}),/invalid_spectator_slot/);
 assert.throws(()=>w.spectate(viewer,{slot:2,x:500}),/invalid_spectator_slot/);
 assert.throws(()=>w.spectate(viewer,{playerId:6}),/invalid_spectator_slot/);
 assert.throws(()=>w.spectate(token(999),{slot:2}),/unknown_session/);
 assert.equal(w.withdraw(viewer).ok,true);
 assert.deepEqual(w.spectate(viewer,{slot:1}),{ok:false,reason:'teammate_unavailable'});
 assert.equal(w.spectate(viewer,{slot:2}).ok,true);
 assert.equal(w.move(viewer,{seq:1,dx:0,dz:1}).reason,'out_of_round');
 const before=w.snapshot(viewer),view=w.snapshot(mate);
 assert.deepEqual(before.spectatorView,
   {playerId:view.self.id,slot:2,x:view.self.x,z:view.self.z,automaticFallback:false});
 assert.equal(JSON.stringify(before).includes(token(6)),false);
 assert.equal(before.self.eligible,false);
 assert.equal(w.snapshot(token(6)).spectatorView,null);
 w.withdraw(mate);
 const switched=w.snapshot(viewer);
 assert.equal(switched.spectatorView.slot,3,'camera follows a real eligible squad member');
 assert.equal(switched.spectatorView.automaticFallback,true);
 assert.deepEqual(switched.visible,w.snapshot(token(2)).visible,'camera inherits only the replacement observer’s own verified view');
 assert.deepEqual(w.spectate(viewer,{slot:2}),{ok:false,reason:'teammate_unavailable'});
 assert.equal(w.spectate(viewer,{slot:3}).ok,true,'can choose another real teammate');
});
test('spectator receives only target-observed rivals and cannot see through common world walls',()=>{
 const w=started(),v=token(0),mate=w.actors.get(token(1)),rival=w.actors.get(token(6));
 w.withdraw(v);w.spectate(v,{slot:2});
 mate.x=59;mate.z=125;rival.x=69;rival.z=125;
 assert.equal(w.snapshot(v).visible.some(p=>p.id===rival.id),false);
 mate.x=0;mate.z=0;rival.x=3;rival.z=0;
 const spectator=w.snapshot(v),own=w.snapshot(token(1));
 assert.deepEqual(spectator.visible,own.visible);
 assert.equal(spectator.visible.some(p=>p.id===rival.id),true);
 rival.x=140;rival.z=140;
 assert.equal(w.snapshot(v).visible.some(p=>p.id===rival.id),false);
});
