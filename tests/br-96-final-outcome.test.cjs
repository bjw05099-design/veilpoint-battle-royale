'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {BrSquadLobby}=require('../src/br-squad-lobby.cjs');
const {BrSquadWorld,BOUNDARY_GRACE_TICKS}=require('../src/br-squad-world.cjs');
const token=i=>i.toString(16).padStart(64,'0');
function match(){
  const lobby=new BrSquadLobby();
  for(let i=0;i<96;i++)lobby.join(token(i),'Human '+i);
  for(let i=0;i<96;i++)lobby.ready(token(i),true);
  return new BrSquadWorld(lobby);
}
test('the running 96-human match has no invented winner or completed result',()=>{
  const world=match();
  assert.equal(world.snapshot(token(0)).matchOutcome,null);
  assert.equal(world.snapshot(token(90)).matchOutcome,null);
});
test('server announces the sole surviving six-person squad without inventing personal victory',()=>{
  const world=match();
  for(let i=0;i<90;i++)assert.equal(world.withdraw(token(i)).ok,true);
  assert.equal(world.phase,'finished');
  assert.equal(world.activeSquads,1);
  const winner=world.snapshot(token(90));
  const retired=world.snapshot(token(0));
  assert.deepEqual(winner.matchOutcome,{
    kind:'squad_win',winningSquad:16,ownSquadPlacement:1,finishedTick:world.tick
  });
  assert.deepEqual(retired.matchOutcome,{
    kind:'squad_placed',winningSquad:16,ownSquadPlacement:2,finishedTick:world.tick
  });
  const terminal=world.snapshot(token(90)).matchOutcome;
  world.step();
  assert.deepEqual(world.snapshot(token(90)).matchOutcome,terminal,
    'closed rounds never recalculate the final result');
});
test('simultaneous final boundary expirations are a tie, not sixteen fabricated champions',()=>{
  const world=match();world.tick=10200;
  for(const p of world.actors.values()){
    p.x=140;p.z=0;p.outsideStreakTicks=BOUNDARY_GRACE_TICKS-1;
  }
  world.step();
  assert.equal(world.phase,'finished');
  assert.equal(world.activeSquads,0);
  for(const n of [0,6,90]){
    assert.deepEqual(world.snapshot(token(n)).matchOutcome,{
      kind:'shared_tie',winningSquad:null,ownSquadPlacement:1,finishedTick:world.tick
    });
  }
});
