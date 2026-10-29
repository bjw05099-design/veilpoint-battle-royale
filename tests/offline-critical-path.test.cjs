'use strict';
// Deterministic 60Hz critical-path tests: real simulation movement, fire and
// interactions, never teleporting actors or marking the native release verified.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Sim=require('../src/simulation.js');
const Story=require('../src/story-slice.js');
const STEP=1/60;

function walkStory(state,point,maxFrames=1200){
 for(let frame=0;frame<maxFrames;frame++){
  const p=state.world.player;
  if(Math.hypot(point.x-p.x,point.z-p.z)<1.8)return frame;
  const beforeX=p.x,beforeZ=p.z;
  p.yaw=Math.atan2(point.x-p.x,-(point.z-p.z));
  Story.step(state,STEP,{forward:true});
  assert.notEqual(state.phase,'failed','critical route must not fail during ordinary traversal');
  assert.ok(Math.hypot(p.x-beforeX,p.z-beforeZ)>1e-7,
    'player must physically advance, not phase through or stall against cover');
 }
 assert.fail('could not reach '+(point.id||'authored waypoint')+' in fixed-step time');
}
function enterEncounter(){
 const state=Story.createState('carbine');
 assert.ok(walkStory(state,Story.POINTS.terminal)>200);
 assert.equal(Story.interact(state).phase,'engagement');
 return state;
}
function clearEncounterWithActualShots(initial,checkpointAfterFirst=false){
 let state=initial;
 for(let id=0;id<3;id++){
  for(let n=0;n<2;n++){
   const target=state.world.bots[id],p=state.world.player;
   p.yaw=Math.atan2(target.x-p.x,-(target.z-p.z));
   p.pitch=0;
   const fired=Story.fire(state);
   assert.equal(fired.ok,true,'finite weapon must fire on deliberate input');
   assert.equal(fired.hit,true,'sight-gated shot must contact the visible opponent');
   for(let frame=0;frame<12;frame++)Story.step(state,STEP,{});
  }
  assert.equal(state.world.bots[id].alive,false);
  if(id===0&&checkpointAfterFirst){
   const serialized=Story.serialize(state);
   state=Story.restore(serialized);
   assert.equal(Story.serialize(state),serialized,'mid-combat checkpoint must replay exactly');
  }
 }
 assert.equal(state.phase,'records');
 assert.equal(state.world.bots.filter(b=>b.alive).length,0);
 return state;
}

test('CH01 full evacuation path is controllable from spawn to exit without teleporting',()=>{
 let state=enterEncounter();
 state=clearEncounterWithActualShots(state,true);
 assert.ok(walkStory(state,Story.POINTS.decision)>100);
 assert.equal(Story.interact(state).phase,'decision');
 assert.equal(Story.choose(state,'evacuation').ok,true);
 state=Story.restore(Story.serialize(state));
 assert.ok(walkStory(state,Story.POINTS.exitEvac)>100);
 assert.equal(Story.interact(state).phase,'complete');
 assert.equal(state.world.status,'won');
 assert.equal(Story.debrief(state).route,'evacuation');
 assert.equal(state.world.player.health,100);
});

test('CH01 verified route persists a moving physical gate through a mid-animation save',()=>{
 let state=clearEncounterWithActualShots(enterEncounter());
 for(const id of ['recordA','recordB']){
  walkStory(state,Story.POINTS[id]);
  assert.equal(Story.interact(state).ok,true);
 }
 walkStory(state,Story.POINTS.decision);
 assert.equal(Story.interact(state).phase,'decision');
 assert.equal(Story.choose(state,'verification').ok,true);
 for(let frame=0;frame<240;frame++)Story.step(state,STEP,{});
 const checkpoint=Story.serialize(state);
 state=Story.restore(checkpoint);
 assert.equal(Story.serialize(state),checkpoint,'gate motor position and deadline survive restore');
 for(let frame=0;frame<240;frame++)Story.step(state,STEP,{});
 // Approach via the clear side of the sliding barrier, not through its collider.
 walkStory(state,{x:27,z:-41,id:'east-approach'});
 walkStory(state,Story.POINTS.exitVerify);
 assert.equal(Story.interact(state).phase,'complete');
 assert.equal(Story.debrief(state).eastCheckpointCleared,true);
 assert.equal(Story.debrief(state).clockDiscrepancy,'unresolved');
});

function playOneRival(resumeTick){
 let game=Sim.newMatch(10,1,'carbine');
 game.status='playing';
 let shots=0,hits=0;
 for(let frame=0;frame<1200&&game.status==='playing';frame++){
  const target=game.bots[0],p=game.player;
  p.yaw=Math.atan2(target.x-p.x,-(target.z-p.z));
  p.pitch=0;
  const distance=Math.hypot(target.x-p.x,target.z-p.z);
  if(distance<65&&frame%12===0){
   const fired=Sim.tag(game);
   if(fired.ok){shots++;if(fired.hit)hits++;}
  }
  Sim.tick(game,STEP,{forward:distance>20,sprint:distance>35});
  if(frame===resumeTick)game=Sim.restoreMatch(Sim.snapshotMatch(game));
 }
 return {status:game.status,elapsed:game.elapsed,kills:game.kills,shots,hits,
  health:game.player.health,charges:game.player.charges,
  placement:Sim.getFinalPlacement(game),x:game.player.x,z:game.player.z};
}

test('offline BR player can traverse, fire finite rounds and win with identical checkpoint replay',()=>{
 const uninterrupted=playOneRival(-1),resumed=playOneRival(300);
 assert.deepEqual(resumed,uninterrupted);
 assert.equal(uninterrupted.status,'won');
 assert.equal(uninterrupted.placement,1);
 assert.equal(uninterrupted.kills,1);
 assert.equal(uninterrupted.hits,3);
 assert.equal(uninterrupted.charges,45);
 assert.ok(Math.hypot(uninterrupted.x,uninterrupted.z)>50,
  'winning route must actually traverse the authored world');
});

test('offline BR inactivity leads to a real loss, not a false first-place finish',()=>{
 const game=Sim.newMatch(20261027,18);
 game.status='playing';
 for(let frame=0;frame<2400&&game.status==='playing';frame++)Sim.tick(game,STEP,{});
 assert.equal(game.status,'lost');
 assert.equal(game.player.health,0);
 assert.ok(Sim.getAliveCount(game)>0);
 assert.equal(Sim.getFinalPlacement(game),Sim.getAliveCount(game)+1);
 assert.throws(()=>Sim.snapshotMatch(game),RangeError,
  'terminal matches cannot be persisted as active games');
});
