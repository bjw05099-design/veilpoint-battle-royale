'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Story=require('../src/story-slice.js');
function lit(){
 const state=Story.createState();
 assert.equal(Story.toggleFlashlight(state).ok,true);
 return state;
}
test('real CH01 headlamp consumes the same battery across subdivided 60Hz updates',()=>{
 const single=lit(),quarter=lit(),eighth=lit(),initial=single.flashlightTicks;
 for(let tick=0;tick<72;tick++)Story.step(single,1/60);
 for(let tick=0;tick<72*4;tick++)Story.step(quarter,1/240);
 for(let tick=0;tick<72*8;tick++)Story.step(eighth,1/480);
 assert.equal(single.flashlightTicks,initial-72);
 assert.equal(quarter.flashlightTicks,single.flashlightTicks);
 assert.equal(eighth.flashlightTicks,single.flashlightTicks);
 assert.equal(quarter.world.flashlightTicks,quarter.flashlightTicks);
 assert.equal(eighth.world.flashlightTicks,eighth.flashlightTicks);
});
test('subtick CH01 save-and-resume preserves pending clock fraction without new save fields',()=>{
 const live=lit(),before=live.flashlightTicks;
 Story.step(live,1/240);Story.step(live,1/240);
 assert.equal(live.flashlightTicks,before,'half a fixed simulation tick must not drain');
 const saved=Story.serialize(live),data=JSON.parse(saved);
 assert.equal(data.version,2,'existing V2 checkpoint format retained');
 const restored=Story.restore(saved);
 assert.equal(restored.flashlightTicks,before);
 Story.step(restored,1/240);
 assert.equal(restored.flashlightTicks,before);
 Story.step(restored,1/240);
 assert.equal(restored.flashlightTicks,before-1,
  'restored time remainder must drain at real next 60Hz boundary');
 assert.equal(restored.world.flashlightTicks,before-1);
});
test('paused and off CH01 lamp cannot lose charge; 10 percent alert uses crossed ticks only',()=>{
 const s=lit();
 s.flashlightTicks=3601;s.world.flashlightTicks=3601;
 for(let i=0;i<3;i++)Story.step(s,1/240);
 assert.equal(s.flashlightTicks,3601);
 Story.step(s,0);Story.step(s,-1);
 assert.equal(s.flashlightTicks,3601);
 Story.step(s,1/240);
 assert.equal(s.flashlightTicks,3600);
 assert.match(s.message,/배터리 부족/);
 const message=s.message,warning=s.subtitle;
 for(let i=0;i<4;i++)Story.step(s,1/240);
 assert.equal(s.flashlightTicks,3599);
 assert.equal(s.subtitle,warning);
 assert.notEqual(s.message,'', 'warning message must not be cleared by silent visual frames');
 assert.equal(Story.toggleFlashlight(s).on,false);
 const charge=s.flashlightTicks;
 for(let i=0;i<200;i++)Story.step(s,1/240);
 assert.equal(s.flashlightTicks,charge,'off light does not consume wall time');
});
