'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {BrSquadLobby}=require('../src/br-squad-lobby.cjs');
const {BrSquadWorld,ROUND_LIMIT_TICKS}=require('../src/br-squad-world.cjs');
const token=i=>i.toString(16).padStart(64,'0');
function match(){
 const lobby=new BrSquadLobby();
 for(let i=0;i<96;i++)lobby.join(token(i),'Participant '+i);
 for(let i=0;i<96;i++)lobby.ready(token(i),true);
 return new BrSquadWorld(lobby);
}
test('96-human prototype publishes the same finite round clock to all authenticated players',()=>{
 const world=match();
 assert.equal(ROUND_LIMIT_TICKS,15*60*60);
 for(const id of [0,47,95]){
  const state=world.snapshot(token(id));
  assert.deepEqual(state.roundClock,{limitTicks:ROUND_LIMIT_TICKS,remainingTicks:ROUND_LIMIT_TICKS});
  assert.equal(state.matchOutcome,null);
 }
 world.tick=ROUND_LIMIT_TICKS-2;
 world.step();
 assert.equal(world.phase,'moving');
 assert.equal(world.snapshot(token(0)).roundClock.remainingTicks,1);
});
test('real server tick closes the round without fabricating a sole champion or opponent action',()=>{
 const world=match();
 // A previous voluntary retirement is settled BEFORE the clock expires.
 for(let i=0;i<6;i++)world.withdraw(token(i));
 assert.equal(world.placements[0],16);
 world.tick=ROUND_LIMIT_TICKS-1;
 world.step();
 assert.equal(world.phase,'finished');
 assert.equal(world.activeSquads,15);
 const winner=world.snapshot(token(6)),retired=world.snapshot(token(0));
 assert.deepEqual(winner.matchOutcome,{kind:'shared_tie',winningSquad:null,
  ownSquadPlacement:1,finishedTick:ROUND_LIMIT_TICKS,reason:'time_limit'});
 assert.deepEqual(retired.matchOutcome,{kind:'shared_tie',winningSquad:null,
  ownSquadPlacement:16,finishedTick:ROUND_LIMIT_TICKS,reason:'time_limit'});
 assert.equal(winner.personalRecap.ownResult,'active_at_finish');
 assert.equal(retired.personalRecap.ownResult,'voluntary_withdrawal');
 assert.equal(winner.roundClock.remainingTicks,0);
 assert.equal(winner.standings.length,16);
 assert.equal(winner.standings.filter(entry=>entry.placement===1).length,15);
 assert.equal(winner.standings.filter(entry=>entry.placement===16).length,1);
 assert.equal(JSON.stringify(winner).includes(token(0)),false,'no session secrets in timer snapshots');
 const last=JSON.stringify(winner);
 world.step();world.step();
 assert.equal(JSON.stringify(world.snapshot(token(6))),last,'finished 60Hz world is immutable');
 assert.equal(world.move(token(6),{seq:0,dx:1,dz:0}).reason,'out_of_round');
});
test('deadline does not overwrite a genuine earlier squad champion',()=>{
 const world=match();
 for(let i=0;i<90;i++)world.withdraw(token(i));
 assert.equal(world.phase,'finished');
 assert.deepEqual(world.snapshot(token(95)).matchOutcome,{
  kind:'squad_win',winningSquad:16,ownSquadPlacement:1,finishedTick:0
 });
 world.tick=ROUND_LIMIT_TICKS+1;world.step();
 assert.equal(world.finishReason,null);
 assert.deepEqual(world.snapshot(token(95)).matchOutcome,{
  kind:'squad_win',winningSquad:16,ownSquadPlacement:1,finishedTick:ROUND_LIMIT_TICKS+1
 });
});
