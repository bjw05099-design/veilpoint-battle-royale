'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Sim=require('../src/simulation.js');

function live(seed,count){
  const game=Sim.newMatch(seed,count,'carbine');
  game.status='playing';
  return game;
}

test('player-selected BR rosters keep real finite AI, inventory and deterministic save/replay',()=>{
  for(const count of [1,4,18]){
    const a=live(20261104,count),b=Sim.restoreMatch(Sim.snapshotMatch(a));
    assert.equal(a.bots.length,count);
    assert.equal(b.bots.length,count);
    assert.equal(Sim.getAliveCount(a),count+1);
    for(let frame=0;frame<120;frame++){
      const input={forward:frame%9<4,right:frame%11<3,sprint:frame%17<5};
      Sim.tick(a,1/60,input);Sim.tick(b,1/60,input);
      if(a.status!=='playing'||b.status!=='playing')break;
      assert.equal(Sim.snapshotMatch(a),Sim.snapshotMatch(b),
        'same 60Hz inputs, roster and seed must replay exactly at frame '+frame);
    }
  }
});

test('single-rival BR earns genuine victory and refuses terminal checkpoint',()=>{
  const match=live(9,1);
  match.bots[0].alive=false;
  match.bots[0].health=0;
  Sim.tick(match,1/60,{});
  assert.equal(match.status,'won');
  assert.equal(Sim.getFinalPlacement(match),1);
  assert.throws(()=>Sim.snapshotMatch(match),/Only active BR/);
  const again=live(match.seed,1);
  assert.equal(again.status,'playing');
  assert.equal(again.bots.length,1);
  assert.equal(Sim.getAliveCount(again),2);
});

test('final published expiry ends a non-unique finish as draw, not an invented first place',()=>{
  const match=live(20261104,1);
  const total=Sim.ZONE_PHASES.reduce((sum,phase)=>sum+phase.duration,0);
  // Both participants are physically inside the final circle with distinct,
  // non-overlapping body footprints; the test advances the published clock,
  // not the world by an unbounded simulation step.
  match.player.x=-1;match.player.z=0;
  const rival=match.bots[0];
  rival.x=1;rival.z=0;rival.actionTime=9;
  assert.equal(Sim.blocked(-1,0,.85,match.obstacles),false);
  assert.equal(Sim.blocked(1,0,.85,match.obstacles),false);
  match.elapsed=total-1/120;
  Object.assign(match.zone,Sim.phaseAt(match.elapsed)); // Retain x/z for a meaningful in-bounds draw.
  Sim.tick(match,1/60,{});
  assert.equal(match.zone.phaseRemaining,0);
  assert.equal(Sim.getAliveCount(match),2);
  assert.equal(match.status,'draw');
  assert.equal(Sim.getFinalPlacement(match),null);
  const frozen=match.elapsed;
  Sim.tick(match,1/60,{forward:true});
  assert.equal(match.elapsed,frozen);
  assert.throws(()=>Sim.snapshotMatch(match),/Only active BR/);
});

test('final deadline outside boundary produces loss, never a draw',()=>{
  const game=live(20261105,1);
  const total=Sim.ZONE_PHASES.reduce((sum,phase)=>sum+phase.duration,0);
  game.player.x=6;game.player.z=0; // Explicitly outside the 1.5m final radius.
  game.elapsed=total-1/120;
  Object.assign(game.zone,Sim.phaseAt(game.elapsed)); // Retain the authored x/z boundary centre.
  assert.equal(Sim.boundaryStatus(game).outside,true,'player begins physically outside final legal circle');
  const previousX=game.player.x;
  Sim.tick(game,1/60,{});
  assert.equal(game.player.x,previousX,'an idle tick cannot move the player inside the circle');
  assert.equal(game.zone.phaseRemaining,0,'fixed-step crosses the last published deadline');
  assert.equal(game.player.alive,false,'boundary ruling must disqualify the outside player before tie logic');
  assert.equal(game.status,'lost');
  assert.notEqual(Sim.getFinalPlacement(game),1);
});

test('PC BR menu and replay code expose genuine match sizes and keep the roster on retry',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
  const app=fs.readFileSync(path.join(__dirname,'../src/app.js'),'utf8');
  for(const size of [1,4,18])assert.match(html,new RegExp('<option value="'+size+'"'));
  assert.match(html,/id="brRoster"/);
  assert.match(app,/Game\.newMatch\(seed,rivals,weaponId,rivals===1,sector,lighting\)/);
  assert.match(app,/start\(lastFinishedMatch\.seed,lastFinishedMatch\.weaponId,lastFinishedMatch\.rivals,\s*memoryOnlyMatch,lastFinishedMatch\.entrySite,lastFinishedMatch\.lighting\)/,
    'same arena retry must preserve the saved roster and memory-only isolation');
  assert.match(app,/start\(seed,weapon,rivals,false,simulation\.entrySite\|\|'central',simulation\.lighting\|\|'day'\)/);
  assert.match(app,/draw\?'FINAL DEADLINE \/ DRAW'/);
});
