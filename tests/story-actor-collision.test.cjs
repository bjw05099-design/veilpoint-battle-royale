'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Story=require('../src/story-slice.js');
const spawn=()=>{const s=Story.createState();s.world.player.x=0;s.world.player.z=-18;
  assert.equal(Story.interact(s).ok,true);return s;};
test('CH01 standing opponents physically block player movement but incapacitated actors do not',()=>{
  const s=spawn(),p=s.world.player,b=s.world.bots[0];
  p.x=0;p.z=-23;p.yaw=0;
  for(let i=0;i<120;i++)Story.step(s,1/60,{forward:true});
  assert.ok(p.z>b.z+1.4,'controller must not cross a standing opponent');
  b.health=0;b.alive=false;
  for(let i=0;i<80;i++)Story.step(s,1/60,{forward:true});
  assert.ok(p.z<b.z,'cleared route must become physically traversable');
});
test('CH01 actor collision is deterministic at fixed 60Hz and survives pose checkpoints',()=>{
  const a=spawn(),b=spawn();
  a.world.player.z=-23;b.world.player.z=-23;
  for(let i=0;i<80;i++){Story.step(a,1/60,{forward:true});Story.step(b,1/60,{forward:true});}
  assert.equal(a.world.player.z,b.world.player.z);
  assert.equal(Story.serialize(a),Story.serialize(b));
  assert.equal(Story.serialize(Story.restore(Story.serialize(a))),Story.serialize(a));
});
test('legacy overlapping CH01 save is not trapped inside a newly solid opponent',()=>{
  const s=spawn();s.world.player.z=-28;
  const loaded=Story.restore(Story.serialize(s));
  const initial=loaded.world.player.z;
  for(let i=0;i<40;i++)Story.step(loaded,1/60,{back:true});
  assert.ok(loaded.world.player.z>initial+2);
});
