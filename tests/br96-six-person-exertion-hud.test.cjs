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
test('real 60Hz stamina of six teammates reaches only their authenticated squad HUD',()=>{
 const {lobby,world}=round();
 const partner=world.actors.get(token(1));
 partner.stamina=42;partner.sprintDepleted=true;
 let mine=world.snapshot(token(0)),other=world.snapshot(token(6));
 const member=mine.squad.find(s=>s.slot===2);
 assert.equal(member.stamina,42);
 assert.equal(member.sprintDepleted,true);
 assert.equal(other.squad.some(s=>s.id===member.id),false);
 assert.match(Panel.roster({...lobby.snapshot(token(0)),world:mine}),/Human 1.*지구력 42\/100.*전력질주 회복 중/);
 assert.doesNotMatch(Panel.roster({...lobby.snapshot(token(6)),world:other}),/Human 1/);
 // The real fixed-step server recovers a stationary person's endurance.
 world.step();
 const after=world.snapshot(token(0)).squad.find(s=>s.slot===2);
 assert.ok(after.stamina>42&&after.stamina<=100);
 assert.equal(after.stamina,Math.round(partner.stamina*100)/100);
 assert.doesNotMatch(JSON.stringify(mine),new RegExp(token(1)));
});

test('legacy and missing server-squad telemetry show no invented fatigue',()=>{
 const {lobby,world}=round();
 const state={...lobby.snapshot(token(0)),world:world.snapshot(token(0))};
 const missing={...state,world:{...state.world,squad:state.world.squad.map(m=>({...m,stamina:undefined,sprintDepleted:undefined,resting:undefined}))}};
 assert.doesNotMatch(Panel.roster(missing),/지구력/);
 const bogus={...state,world:{...state.world,squad:state.world.squad.map(m=>({...m,stamina:240}))}};
 assert.doesNotMatch(Panel.roster(bogus),/지구력/);
 assert.match(Panel.roster(state),/우리 분대 · 실시간 참가 상태/);
});