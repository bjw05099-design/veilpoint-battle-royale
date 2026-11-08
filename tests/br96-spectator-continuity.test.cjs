'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {BrSquadLobby}=require('../src/br-squad-lobby.cjs');
const {BrSquadWorld}=require('../src/br-squad-world.cjs');
const token=i=>i.toString(16).padStart(64,'0');
function world96(){
 const lobby=new BrSquadLobby();
 for(let i=0;i<96;i++)assert.equal(lobby.join(token(i),'Human '+i).ok,true);
 for(let i=0;i<96;i++)assert.equal(lobby.ready(token(i),true).ok,true);
 return new BrSquadWorld(lobby);
}
test('BR96 observed teammate withdrawal falls back cyclically to genuine next occupied seat',()=>{
 const world=world96(),viewer=token(0);
 assert.equal(world.withdraw(viewer).ok,true);
 assert.equal(world.spectate(viewer,{slot:5}).ok,true);
 assert.equal(world.snapshot(viewer).spectatorView.slot,5);
 assert.equal(world.withdraw(token(4)).ok,true);
 let view=world.snapshot(viewer);
 assert.equal(view.spectatorView.slot,6);
 assert.equal(view.spectatorView.automaticFallback,true);
 assert.equal(world.withdraw(token(5)).ok,true);
 view=world.snapshot(viewer);
 assert.equal(view.spectatorView.slot,2,'wraps to the first live real teammate');
 assert.equal(view.spectatorView.automaticFallback,true);
 assert.deepEqual(view.visible,world.snapshot(token(1)).visible);
 assert.equal(view.self.eligible,false,'watching never revives the withdrawn player');
 assert.equal(world.actors.get(viewer).spectateSlot,5,'only a user command changes saved selection');
 assert.equal(world.spectate(viewer,{slot:2}).ok,true);
 assert.equal(world.snapshot(viewer).spectatorView.automaticFallback,false);
});
test('BR96 retiring the entire observed squad closes private view without inventing a new observer',()=>{
 const world=world96(),viewer=token(0);
 world.withdraw(viewer);world.spectate(viewer,{slot:2});
 for(let i=1;i<6;i++)world.withdraw(token(i));
 const view=world.snapshot(viewer);
 assert.equal(view.spectatorView,null);
 assert.deepEqual(view.visible,[]);
 assert.equal(view.self.eligible,false);
 assert.equal(view.standings[0].eligibleMembers,0);
 assert.equal(view.self.placement,16);
 assert.equal(world.spectate(viewer,{slot:2}).ok,false);
});
test('BR96 reconnecting an observed teammate keeps the same real pose and same-team scope',()=>{
 const world=world96(),viewer=token(0),old=token(1),replacement='d'.repeat(64);
 world.withdraw(viewer);world.spectate(viewer,{slot:2});
 const before=world.snapshot(viewer).spectatorView;
 assert.equal(world.rebindSession(old,replacement).ok,true);
 const after=world.snapshot(viewer).spectatorView;
 assert.deepEqual(after,before,'token refresh never invents a new camera');
 assert.equal(JSON.stringify(world.snapshot(viewer)).includes(replacement),false);
});
