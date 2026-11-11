'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {BrSquadLobby}=require('../src/br-squad-lobby.cjs');
const {BrSquadWorld}=require('../src/br-squad-world.cjs');
const Panel=require('../src/br96-squad-panel.js');
const token=i=>i.toString(16).padStart(64,'0');
function fullRound(){
 const lobby=new BrSquadLobby();
 for(let i=0;i<96;i++)assert.equal(lobby.join(token(i),'Human '+i).ok,true);
 for(let i=0;i<96;i++)assert.equal(lobby.ready(token(i),true).ok,true);
 return {lobby,world:new BrSquadWorld(lobby)};
}
test('96-human real-world squad gesture appears only to an actually nearby observer',()=>{
 const {lobby,world}=fullRound();
 assert.equal(world.actors.size,96);
 const own=world.actors.get(token(0)),observer=world.actors.get(token(1));
 const initial={x:observer.x,z:observer.z};
 assert.equal(world.wave(token(0)).ok,true);
 const close=world.snapshot(token(1));
 const actual=close.squad.find(p=>p.id===own.id);
 assert.equal(actual.nearbyTeammate,true);
 assert.equal(actual.waving,true);
 assert.match(Panel.roster({...lobby.snapshot(token(1)),world:close}),
  /Human 0 · 참가 중 · 가까이 있음 · 손짓 확인/);
 observer.x=own.x+35;observer.z=own.z+35;
 const far=world.snapshot(token(1)),farMember=far.squad.find(p=>p.id===own.id);
 assert.equal(farMember.nearbyTeammate,false);
 assert.equal(farMember.waving,false,'authenticated team membership is not remote visual knowledge');
 assert.doesNotMatch(Panel.roster({...lobby.snapshot(token(1)),world:far}),/손짓 확인/);
 assert.equal(world.snapshot(token(0)).self.waving,true,
  'the original human gesture continues in authoritative 60Hz time');
 observer.x=initial.x;observer.z=initial.z;
 for(let i=0;i<120;i++)world.step();
 assert.equal(world.snapshot(token(1)).squad.find(p=>p.id===own.id).waving,false);
});
test('PC roster never invents a remote wave from an unverified or stale team snapshot',()=>{
 const state={squad:[
  {id:1,name:'사람 1',slot:1},{id:2,name:'사람 2',slot:2}],
  world:{mode:'br-96-traversal-prototype',phase:'moving',squad:[
   {id:1,slot:1,eligible:true,connection:'fresh'},
   {id:2,slot:2,eligible:true,connection:'fresh',waving:true,nearbyTeammate:false}
  ]}};
 assert.doesNotMatch(Panel.roster(state),/손짓 확인/);
 const verified={...state,world:{...state.world,
  squad:state.world.squad.map(x=>x.id===2?{...x,nearbyTeammate:true}:x)}};
 assert.match(Panel.roster(verified),/손짓 확인/);
 assert.equal(state.world.squad[1].nearbyTeammate,false);
});
