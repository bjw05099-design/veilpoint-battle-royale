'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const Story=require('../src/story-slice.js');
const Sim=require('../src/simulation.js');
const Visibility=require('../src/visibility.js');

test('Kim Jiyoon exists in actual CH01 world and follows on physically walkable ground',()=>{
 const state=Story.createState();
 assert.deepEqual(state.kimJiyoon,{x:-3,z:9});
 assert.equal(state.world.kimJiyoon.role,'kim-jiyoon');
 assert.equal(Sim.blocked(-3,9,.55,state.world.obstacles),false);
 const before={...state.kimJiyoon};
 for(let i=0;i<110;i++)Story.step(state,1/60,{forward:true});
 assert.ok(Math.hypot(state.kimJiyoon.x-before.x,state.kimJiyoon.z-before.z)>.5,
   'companion walks toward the captain on the original harbor pavement');
 assert.ok(Math.hypot(state.kimJiyoon.x-before.x,state.kimJiyoon.z-before.z)<=110*5/60+.1,
   'finite 60Hz footstep budget prevents teleport-to-player');
 assert.equal(Sim.blocked(state.kimJiyoon.x,state.kimJiyoon.z,.55,state.world.obstacles),false);
 assert.equal(state.world.kimJiyoon.x,state.kimJiyoon.x);
 assert.equal(state.world.kimJiyoon.z,state.kimJiyoon.z);
});

test('same witnessed incident changes companion behavior without creating a quest or remote tracking',()=>{
 const state=Story.createState();
 state.world.player.x=0;state.world.player.z=-18;
 state.world.elapsed=10.3;
 Story.step(state,1/60,{});
 assert.equal(state.phase,'engagement');
 const before={...state.kimJiyoon};
 for(let i=0;i<75;i++)Story.step(state,1/60,{});
 const moved=Math.hypot(state.kimJiyoon.x-before.x,state.kimJiyoon.z-before.z);
 assert.ok(moved>0,'the companion changes route after the actual escalation');
 assert.ok(moved<=75*1.8/60+.1,'the local reaction is a real measured walk');
 assert.equal(Sim.blocked(state.kimJiyoon.x,state.kimJiyoon.z,.55,state.world.obstacles),false);
 const dumped=Story.serialize(state),restored=Story.restore(dumped);
 assert.deepEqual(restored.kimJiyoon,state.kimJiyoon);
 assert.equal(restored.world.kimJiyoon.role,'kim-jiyoon');
 assert.equal(Story.serialize(restored),dumped);
});

test('older checkpoints do not invent a newly arrived companion mid-mission',()=>{
 const state=Story.createState(),record=JSON.parse(Story.serialize(state));
 delete record.kimJiyoon;
 const old=Story.restore(JSON.stringify(record));
 assert.equal(old.kimJiyoon,null);
 assert.equal(old.world.kimJiyoon,null);
 const malformed=[
  {x:Infinity,z:0},{x:300,z:0},{x:0,z:'bad'},{x:0,z:0,secret:'remote'}
 ];
 for(const person of malformed)
  assert.throws(()=>Story.restore(JSON.stringify({...record,kimJiyoon:person})),RangeError);
});

test('companion is filtered by real visibility and uses nonmagical 2D and WebGL body rendering',()=>{
 const state=Story.createState();
 state.world.player.x=-3;state.world.player.z=16;state.world.player.yaw=0;
 const onScreen=Visibility.planVisible(state.world,16/9);
 assert.ok((onScreen.witnesses||[]).some(w=>w.entity.role==='kim-jiyoon'),
  'physically visible person appears in the same finite CH01 culling layer');
 state.world.player.yaw=Math.PI;
 const away=Visibility.planVisible(state.world,16/9);
 assert.equal((away.witnesses||[]).some(w=>w.entity.role==='kim-jiyoon'),false,
  'turning away cannot reveal a character through a HUD icon');
 const renderer=fs.readFileSync(path.join(__dirname,'../src/renderer.js'),'utf8');
 assert.match(renderer,/w\.role==='kim-jiyoon'/);
 assert.match(renderer,/type:'field-companion'/);
 assert.match(renderer,/companion\?\[\.37,\.47,\.53\]/);
});
