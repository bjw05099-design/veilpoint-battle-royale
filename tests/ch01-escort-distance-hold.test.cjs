'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Story=require('../src/story-slice.js');

function escort(){
 const state=Story.createState();
 state.phase='exit';state.choice='evacuation';
 state.musterConfirmed=true;
 Object.assign(state.guide,{active:true,arrived:false,released:false,waiting:false});
 return state;
}

test('CH01 guide physically waits when captain exceeds local 14m corridor at fixed 60Hz',()=>{
 const state=escort();
 const guideStart={x:state.guide.x,z:state.guide.z};
 state.world.player.x=state.guide.x+15;
 state.world.player.z=state.guide.z;
 Story.step(state,1/60,{});
 assert.equal(state.guide.waiting,true);
 assert.deepEqual({x:state.guide.x,z:state.guide.z},guideStart);
 assert.match(state.message,/현장 대기/);
 assert.equal(Story.missionTasks(state).find(x=>x.id==='guide').status,'waiting');
 assert.equal(Story.missionTasks(state).find(x=>x.id==='exit').status,'blocked');
 for(let i=0;i<60;i++)Story.step(state,1/60,{});
 assert.deepEqual({x:state.guide.x,z:state.guide.z},guideStart,
  'waiting civilian cannot teleport or silently catch up');
 assert.equal(state.guide.waiting,true);
 assert.equal(Object.hasOwn(state.guide,'lastKnownPlayer'),false,
  'no remote player tracking or save schema extension');
});

test('invalid and paused fixed steps cannot invent a civilian hold',()=>{
 const state=escort();
 state.world.player.x=state.guide.x+16;
 state.world.player.z=state.guide.z;
 Story.step(state,0,{});
 Story.step(state,NaN,{});
 assert.equal(state.guide.waiting,false);
 Story.step(state,1/60,{});
 assert.equal(state.guide.waiting,true);
});
