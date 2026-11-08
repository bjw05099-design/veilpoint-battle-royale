'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Sim=require('../src/simulation.js');
const Story=require('../src/story-slice.js');
const PREFIX='aden-market-court-';
function court(world){return world.obstacles.filter(body=>body.type.startsWith(PREFIX))
 .map(body=>({type:body.type,x:body.x,z:body.z,w:body.w,d:body.d,h:body.h}));}
test('BR and CH01 physically share a single original civilian market court geometry',()=>{
 const br=Sim.newMatch(20261108,0,'carbine'),story=Story.createState();
 const a=court(br),b=court(story.world);
 assert.equal(a.length,10,'two opened entrances, side counters and benches are genuine solids');
 assert.deepEqual(b,a,'story consumes same 60Hz source, no separately invented city');
 for(const world of [br,story.world]){
  assert.equal(Sim.blocked(-107,128,.85,world.obstacles),false,
    'north-south public pedestrian passage stays accessible');
  assert.equal(Sim.blocked(-107,114,.85,world.obstacles),false,
    'the south entrance is really open');
  assert.equal(Sim.blocked(-107,142,.85,world.obstacles),false,
    'the north entrance is really open');
  assert.equal(Sim.blocked(-123,128,.85,world.obstacles),true,
    'a visible side wall is also solid');
  const walker={x:-107,z:109};
  for(let i=0;i<540;i++)Sim.moveEntity(walker,0,5,1/60,world.obstacles,.85);
  assert.ok(walker.z>145,'one continuous physically walkable corridor crosses the entire block');
 }
});
test('historic revision-zero offline terrain remains unchanged and CH01 v2 saves still restore',()=>{
 const legacy=Sim.newMatch(20261108,0,'carbine',false,'central','day',0);
 assert.equal(court(legacy).length,0,'legacy terrain revision is not retroactively altered');
 const story=Story.createState(),save=Story.serialize(story);
 const restored=Story.restore(save);
 assert.deepEqual(court(restored.world),court(story.world));
 assert.equal(Story.serialize(restored),save);
});
