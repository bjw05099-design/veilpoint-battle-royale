'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Sim=require('../src/simulation.js');

function checkpoint(){
  const game=Sim.newMatch(20261031,3,'carbine');
  game.status='playing';
  return JSON.parse(Sim.snapshotMatch(game));
}

test('BR checkpoint restore rejects malformed player control flags instead of silently disabling them',()=>{
  for(const [field,value] of [
    ['alive','true'],['alive',1],['reloadAssist','false'],
    ['reloadHesitation',0],['sprintExhausted',null]
  ]){
    const saved=checkpoint();
    saved.player[field]=value;
    assert.throws(()=>Sim.restoreMatch(JSON.stringify(saved)),RangeError,field);
  }
});

test('BR checkpoint restore rejects nonboolean opponent and cache state',()=>{
  for(const [kind,value] of [['bot',0],['bot','false'],['loot',null],['loot','false']]){
    const saved=checkpoint();
    if(kind==='bot')saved.bots[0].alive=value;
    else saved.loot[0].picked=value;
    assert.throws(()=>Sim.restoreMatch(JSON.stringify(saved)),RangeError,kind);
  }
});

test('older v1 BR checkpoint without optional control flags resumes with safe defaults',()=>{
  const saved=checkpoint();
  for(const key of ['reloadAssist','reloadHesitation','sprintExhausted'])
    delete saved.player[key];
  const resumed=Sim.restoreMatch(JSON.stringify(saved));
  assert.equal(resumed.player.alive,true);
  assert.equal(resumed.player.reloadAssist,false);
  assert.equal(resumed.player.reloadHesitation,false);
  assert.equal(resumed.player.sprintExhausted,false);
  assert.equal(Sim.snapshotMatch(Sim.restoreMatch(Sim.snapshotMatch(resumed))),
    Sim.snapshotMatch(resumed));
});

test('valid BR boolean flags and finite state survive a 60Hz checkpoint replay',()=>{
  const game=Sim.newMatch(20261031,3,'compact');
  game.status='playing';
  game.player.reloadAssist=true;
  game.player.sprintExhausted=true;
  const restored=Sim.restoreMatch(Sim.snapshotMatch(game));
  assert.equal(restored.player.reloadAssist,true);
  assert.equal(restored.player.sprintExhausted,true);
  for(let i=0;i<120;i++){
    const input={forward:i%60<20,crouch:i%60>=20};
    Sim.tick(game,1/60,input);
    Sim.tick(restored,1/60,input);
    assert.equal(Sim.snapshotMatch(restored),Sim.snapshotMatch(game));
  }
});
