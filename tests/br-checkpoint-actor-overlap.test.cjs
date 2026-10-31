'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Sim=require('../src/simulation.js');

function game(){
  const g=Sim.newMatch(20261031,3);
  g.status='playing';
  return g;
}

test('BR refuses to overwrite a valid checkpoint with overlapping living actors',()=>{
  const g=game();
  const valid=Sim.snapshotMatch(g);
  g.bots[0].x=g.player.x;
  g.bots[0].z=g.player.z;
  assert.throws(()=>Sim.snapshotMatch(g),RangeError);
  assert.equal(Sim.snapshotMatch(Sim.restoreMatch(valid)),valid);
});

test('BR restore refuses tampered player/rival and rival/rival living overlaps',()=>{
  for(const pair of ['player-bot','bot-bot']){
    const saved=JSON.parse(Sim.snapshotMatch(game()));
    const source=pair==='player-bot'?saved.player:saved.bots[0];
    saved.bots[pair==='player-bot'?0:1].x=source.x;
    saved.bots[pair==='player-bot'?0:1].z=source.z;
    assert.throws(()=>Sim.restoreMatch(JSON.stringify(saved)),RangeError,pair);
  }
});

test('BR fallen opponents may occupy a live actor position without blocking save',()=>{
  const g=game();
  g.bots[0].health=0;
  g.bots[0].alive=false;
  g.bots[0].x=g.player.x;
  g.bots[0].z=g.player.z;
  const saved=Sim.snapshotMatch(g);
  const resumed=Sim.restoreMatch(saved);
  assert.equal(resumed.bots[0].alive,false);
  assert.equal(Sim.snapshotMatch(resumed),saved);
});

test('valid spaced actors retain deterministic 60Hz BR save/replay',()=>{
  const g=game();
  for(let i=0;i<90;i++)Sim.tick(g,1/60,{forward:i<30});
  const restored=Sim.restoreMatch(Sim.snapshotMatch(g));
  for(let i=0;i<90;i++){
    const input={left:i%30<10};
    Sim.tick(g,1/60,input);
    Sim.tick(restored,1/60,input);
    assert.equal(Sim.snapshotMatch(restored),Sim.snapshotMatch(g));
  }
});
