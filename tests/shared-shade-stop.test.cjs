'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Sim=require('../src/simulation.js');
const Story=require('../src/story-slice.js');

test('BR and CH01 share six real civic shade-stop solids; historical terrain does not change',()=>{
  const br=Sim.newMatch(20261109,0,'carbine',false,'central','day',1);
  const old=Sim.newMatch(20261109,0,'carbine',false,'central','day',0);
  const story=Story.createState();
  const select=world=>world.obstacles.filter(o=>o.type.startsWith('aden-shadestop-'))
    .map(o=>({x:o.x,z:o.z,w:o.w,d:o.d,h:o.h,type:o.type}));
  assert.equal(select(br).length,6);
  assert.deepEqual(select(story.world),select(br));
  assert.deepEqual(select(old),[]);
  assert.equal(select(br).filter(o=>o.type.endsWith('post')).length,4);
  assert.equal(select(br).filter(o=>o.type.endsWith('seat')).length,2);
});
test('shade-stop central passage is traversable and its visible supports are physical',()=>{
  const br=Sim.newMatch(20261109,0,'carbine',false,'central','day',1);
  const story=Story.createState();
  for(const world of [br,story.world]){
    for(let x=-4;x<=4;x+=.5)
      assert.equal(Sim.blocked(x,55,.85,world.obstacles),false,
        'center passage must be open to a standing player at x='+x);
    assert.equal(Sim.blocked(-9,48,.85,world.obstacles),true);
    assert.equal(Sim.blocked(9,61,.85,world.obstacles),true);
  }
});
