'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Story=require('../src/story-slice.js');
const go=(s,x,z)=>{s.world.player.x=x;s.world.player.z=z;};
test('CH01 natural incident can start by physically reaching original liaison site after Korea predeparture recap',()=>{
 const s=Story.createState();
 for(let i=0;i<60*11;i++)Story.step(s,1/60,{});
 assert.equal(s.phase,'terminal','time alone cannot manufacture an encounter far from its site');
 assert.equal(s.deploymentReviewed,false,'original deployment was already briefed in Korea');
 go(s,Story.POINTS.terminal.x,Story.POINTS.terminal.z+4);
 Story.step(s,1/60,{forward:true});
 assert.equal(s.phase,'engagement','nearby witnessed escalation should be a real world event, not a required console click');
 assert.equal(s.combat.started,true);
 assert.equal(s.awningFallen,true);
 assert.equal(s.world.bots.length,3);
 assert.equal(s.deploymentReviewed,false,'the captain never needs to find his deployment order locally');
 const restored=Story.restore(Story.serialize(s));
 assert.equal(restored.phase,'engagement');
 assert.equal(restored.awningFallen,true);
});
test('CH01 preserves E action for earlier players and never repeats incident after state restore',()=>{
 const s=Story.createState();
 go(s,Story.POINTS.terminal.x,Story.POINTS.terminal.z);
 const action=Story.interact(s);
 assert.equal(action.ok,true);
 assert.equal(action.phase,'engagement');
 const originalBots=s.world.bots;
 for(let i=0;i<60*12;i++)Story.step(s,1/60,{});
 assert.equal(s.world.bots,originalBots,'an automatic proximity check must not reset a live incident');
 assert.equal(s.combat.started,true);
});
test('CH01 does not launch a surprise attack before predeparture context completes',()=>{
 const s=Story.createState();
 go(s,Story.POINTS.terminal.x,Story.POINTS.terminal.z+4);
 for(let i=0;i<60*9;i++)Story.step(s,1/60,{});
 assert.equal(s.phase,'terminal','opening recap remains uninterrupted until the incident starts');
});
