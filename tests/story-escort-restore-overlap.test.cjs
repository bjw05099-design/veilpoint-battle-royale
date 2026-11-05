'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const story=require('../src/story-slice.js');
const Sim=require('../src/simulation.js');

function escortCheckpoint(waiting=false) {
  const state=story.createState();
  state.phase='exit';
  state.choice='evacuation';
  state.musterConfirmed=true;
  state.guide.active=true;
  state.guide.waiting=waiting;
  state.combat.started=true;
  state.combat.cleared=true;
  state.world.bots=[
    {id:0,x:0,z:-28,angle:Math.PI,health:0,alive:false,shots:12},
    {id:1,x:15,z:-34,angle:Math.PI,health:0,alive:false,shots:12},
    {id:2,x:-15,z:-34,angle:Math.PI,health:0,alive:false,shots:12}
  ];
  return state;
}

test('legacy escort checkpoint separates captain from guide without moving guide',()=>{
  const state=escortCheckpoint();
  state.world.player.x=state.guide.x;
  state.world.player.z=state.guide.z;
  const checkpoint=story.serialize(state);
  const a=story.restore(checkpoint);
  const b=story.restore(checkpoint);
  const body={x:a.guide.x,z:a.guide.z,w:1.1,d:1.1};
  assert.deepEqual([a.world.player.x,a.world.player.z],[b.world.player.x,b.world.player.z]);
  assert.deepEqual([a.guide.x,a.guide.z],[state.guide.x,state.guide.z]);
  assert.equal(Sim.blocked(a.world.player.x,a.world.player.z,.85,[body,...a.world.obstacles]),false);
  assert.match(a.message,/동행 안내원/);
  assert.equal(a.phase,'exit');
  assert.equal(a.world.status,'playing');
  assert.equal(story.nearest(a)?.id,'guideControl');
  const previousZ=a.guide.z;
  story.step(a,1/60,{forward:true});
  assert.ok(a.guide.z<previousZ,'escort takes a physical fixed-step toward player');
  assert.equal(a.world.status,'playing');
});

test('already separated escort checkpoint keeps positions and waiting controls',()=>{
  const state=escortCheckpoint(true);
  state.world.player.x=-10.5;
  state.world.player.z=-56.7;
  const restored=story.restore(story.serialize(state));
  assert.equal(restored.world.player.x,state.world.player.x);
  assert.equal(restored.world.player.z,state.world.player.z);
  assert.equal(restored.guide.waiting,true);
  assert.equal(story.nearest(restored)?.id,'guideControl');
  assert.equal(story.interact(restored).ok,true);
  assert.equal(restored.guide.waiting,false);
  const replay=story.restore(story.serialize(restored));
  assert.equal(replay.guide.waiting,false);
  assert.equal(replay.phase,'exit');
});

test('overlapping paused escort restores with a reachable local resume prompt',()=>{
  const state=escortCheckpoint(true);
  state.world.player.x=state.guide.x;
  state.world.player.z=state.guide.z;
  const restored=story.restore(story.serialize(state));
  assert.equal(restored.guide.waiting,true);
  assert.equal(story.nearest(restored)?.id,'guideControl');
  assert.equal(story.interact(restored).ok,true);
  assert.equal(restored.guide.waiting,false);
});

test('arrived courtyard guide remains solid after reload and cannot trap the captain',()=>{
  const state=escortCheckpoint();
  state.guide.arrived=true;
  state.guide.waiting=false;
  state.guide.x=story.POINTS.exitEvac.x;
  state.guide.z=story.POINTS.exitEvac.z;
  state.world.player.x=state.guide.x;
  state.world.player.z=state.guide.z;
  const raw=story.serialize(state);
  const resumed=story.restore(raw),again=story.restore(raw);
  const body={x:resumed.guide.x,z:resumed.guide.z,w:1.1,d:1.1};
  assert.equal(resumed.guide.arrived,true);
  assert.deepEqual([resumed.guide.x,resumed.guide.z],[state.guide.x,state.guide.z]);
  assert.equal(Sim.blocked(resumed.world.player.x,resumed.world.player.z,.85,[body,...resumed.world.obstacles]),false);
  assert.deepEqual([resumed.world.player.x,resumed.world.player.z],[again.world.player.x,again.world.player.z]);
  assert.match(resumed.message,/동행 안내원/);
  assert.equal(story.nearest(resumed)?.id,'exitEvac');
  assert.equal(story.interact(resumed).ok,true,'captain can still finish a physically arrived escort');
  assert.equal(resumed.phase,'complete');
});

test('locally handed-off escort remains a physical actor and reload separates overlap',()=>{
  const state=escortCheckpoint();
  state.guide.active=false;
  state.guide.released=true;
  state.guide.waiting=false;
  state.world.player.x=state.guide.x;
  state.world.player.z=state.guide.z;
  const raw=story.serialize(state);
  const restored=story.restore(raw);
  const g=restored.guide;
  assert.equal(g.active,false);
  assert.equal(g.released,true);
  assert.deepEqual([g.x,g.z],[state.guide.x,state.guide.z]);
  assert.equal(Sim.blocked(restored.world.player.x,restored.world.player.z,.85,
    [{x:g.x,z:g.z,w:1.1,d:1.1},...restored.world.obstacles]),false);
  const after=story.serialize(restored);
  const replay=story.restore(after);
  assert.equal(story.serialize(replay),after,'recovered checkpoint is stable across the next reload');
  assert.equal(replay.world.status,'playing');
});

test('already valid physical courtyard saves are never relocated',()=>{
  const state=escortCheckpoint();
  state.guide.arrived=true;state.guide.x=story.POINTS.exitEvac.x;
  state.guide.z=story.POINTS.exitEvac.z;
  state.world.player.x=state.guide.x+2;
  state.world.player.z=state.guide.z;
  const raw=story.serialize(state),restored=story.restore(raw);
  assert.deepEqual([restored.world.player.x,restored.world.player.z],
    [state.world.player.x,state.world.player.z]);
  assert.equal(story.serialize(restored),raw);
});
