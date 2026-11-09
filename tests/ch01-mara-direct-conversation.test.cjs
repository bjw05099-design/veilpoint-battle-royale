'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Story=require('../src/story-slice.js');
const Sim=require('../src/simulation.js');
function go(state,x,z){state.world.player.x=x;state.world.player.z=z;}
function marketScene(){
 const state=Story.createState();
 go(state,Story.POINTS.terminal.x,Story.POINTS.terminal.z);
 assert.equal(Story.interact(state).phase,'engagement');
 for(const actor of state.world.bots){actor.alive=false;actor.health=0;}
 state.combat.cleared=true;state.phase='records';
 return state;
}
function crossedScene(){
 const state=marketScene();
 go(state,20.5,-38);
 assert.equal(Story.interact(state).event,'awning_clear_started');
 for(let tick=0;tick<1300&&!state.mara.arrived;tick++)Story.step(state,1/60,{});
 assert.equal(state.mara.arrived,true);
 return state;
}
test("Mara's optional conversation requires a real cleared market crossing and direct local proximity",()=>{
 const s=marketScene();
 go(s,25,-38);
 assert.equal(Story.markers(s).some(m=>m.id==='maraConversation'),false);
 const completed=crossedScene();
 go(completed,100,100);
 assert.equal(Story.markers(completed).some(m=>m.id==='maraConversation'),false,
   'distant player cannot open a remote conversation');
 go(completed,25,-38);
 assert.ok(Story.markers(completed).some(m=>m.id==='maraConversation'),
   'an actor who has physically walked the newly cleared lane becomes directly approachable');
 const before=Story.serialize(completed);
 const result=Story.interact(completed);
 assert.equal(result.event,'maraConversation');
 assert.equal(completed.phase,'records');
 assert.equal(completed.choice,null);
 assert.deepEqual(completed.found,[],'conversation does not demand searching papers');
 assert.match(completed.subtitle,/제 대신 걸어온 건 아닙니다/);
 assert.match(completed.subtitle,/실제 통행 상황/);
 assert.equal(Story.serialize(completed),before,
   'no extra save fields or fictional mission progress from dialogue');
 assert.equal(Story.serialize(Story.restore(before)),before);
});
test('Mara never authorizes an unseen street gate or claims everyone is safe',()=>{
 const s=crossedScene();
 go(s,Story.POINTS.decision.x,Story.POINTS.decision.z);
 assert.equal(Story.interact(s).phase,'decision');
 assert.equal(Story.choose(s,'verification').ok,true);
 go(s,25,-38);
 assert.equal(Story.interact(s).event,'maraConversation');
 assert.match(s.subtitle,/현지 담당자의 개방 확인/);
 assert.equal(Story.situation(s).eastGateOpen,false);
 const south=crossedScene();
 go(south,Story.POINTS.decision.x,Story.POINTS.decision.z);
 assert.equal(Story.interact(south).phase,'decision');
 assert.equal(Story.choose(south,'evacuation').ok,true);
 go(south,25,-38);
 assert.equal(Story.interact(south).event,'maraConversation');
 assert.match(south.subtitle,/주민 전부가 도착한 건 아니에요/);
 assert.equal(south.guide.arrived,false);
});
test('a wall blocks this in-person encounter without affecting existing marker identities',()=>{
 const s=crossedScene();
 go(s,25,-36.5);
 const wall={x:25,z:-38,w:1,d:.5,h:3};
 s.world.obstacles.push(wall);
 assert.equal(Sim.lineBlocked(s.world.player.x,s.world.player.z,s.mara.x,s.mara.z,s.world.obstacles),true);
 assert.equal(Story.markers(s).some(m=>m.id==='maraConversation'),false);
 s.world.obstacles.pop();
 assert.equal(Story.markers(s).some(m=>m.id==='maraConversation'),true);
});
