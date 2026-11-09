'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {BrSquadLobby}=require('../src/br-squad-lobby.cjs');
const {BrSquadWorld}=require('../src/br-squad-world.cjs');
const Panel=require('../src/br96-squad-panel.js');
const token=i=>i.toString(16).padStart(64,'0');
function round(){
 const lobby=new BrSquadLobby();
 for(let i=0;i<96;i++)lobby.join(token(i),'Human '+i);
 for(let i=0;i<96;i++)lobby.ready(token(i),true);
 return {lobby,world:new BrSquadWorld(lobby)};
}
test('only actually close, visible members of a real six-human squad show nearby in its own PC HUD',()=>{
 const {lobby,world}=round();
 const self=world.actors.get(token(0)),partner=world.actors.get(token(1));
 // The fixed world, not a client-supplied waypoint, owns both positions.
 partner.x=self.x;partner.z=self.z;
 const mine=world.snapshot(token(0)),other=world.snapshot(token(6));
 const member=mine.squad.find(s=>s.slot===2);
 assert.equal(member.nearbyTeammate,true);
 assert.equal(Object.hasOwn(member,'stamina'),false,'private exertion must never leak to a teammate');
 assert.equal(other.squad.some(s=>s.id===member.id),false);
 assert.match(Panel.roster({...lobby.snapshot(token(0)),world:mine}),/Human 1 · 참가 중 · 가까이 있음/);
 assert.doesNotMatch(Panel.roster({...lobby.snapshot(token(6)),world:other}),/Human 1 ·/);
 // One genuine authoritative simulation tick updates the same snapshot,
 // without an untrusted proximity POST or a client target identity.
 world.step();
 assert.equal(world.tick,1);
 const postTick=world.snapshot(token(0));
 assert.equal(typeof postTick.squad.find(s=>s.slot===2).nearbyTeammate,'boolean');
 // The same member is no longer local when the server has them elsewhere.
 partner.x=self.x+30;partner.z=self.z;
 assert.equal(world.snapshot(token(0)).squad.find(s=>s.slot===2).nearbyTeammate,false);
 assert.doesNotMatch(Panel.roster({...lobby.snapshot(token(0)),world:world.snapshot(token(0))}),/Human 1 · 참가 중 · 가까이 있음/);
});
test('legacy world snapshots never infer location or reveal private resources',()=>{
 const {lobby,world}=round();
 const state={...lobby.snapshot(token(0)),world:world.snapshot(token(0))};
 const unknown={...state,world:{...state.world,squad:state.world.squad.map(m=>({...m,nearbyTeammate:undefined}))}};
 assert.doesNotMatch(Panel.roster(unknown),/가까이 있음|주변에서 이동 중/);
 assert.equal(state.world.squad.length,6);
 assert.ok(state.world.squad.every(m=>!Object.hasOwn(m,'stamina')&&!Object.hasOwn(m,'sprintDepleted')));
 assert.doesNotMatch(JSON.stringify(state),new RegExp(token(1)));
 assert.match(Panel.roster(state),/우리 분대 · 실시간 참가 상태/);
});