'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Sim=require('../src/simulation.js');

test('BR original loadout retains default movement while extra supplies have bounded physical travel cost',()=>{
  const baseline=Sim.newMatch(18601,1);
  const loaded=Sim.newMatch(18601,1);
  baseline.status=loaded.status='playing';
  const kit=Sim.FIREARMS.carbine;
  loaded.player.charges=kit.maxRounds;
  assert.equal(Sim.supplyLoadMobility(baseline.player),1);
  assert.ok(Math.abs(Sim.supplyLoadMobility(loaded.player)-0.88)<1e-12);
  const beforeNormal=baseline.player.z,beforeLoaded=loaded.player.z;
  Sim.tick(baseline,1/60,{forward:true,sprint:true});
  Sim.tick(loaded,1/60,{forward:true,sprint:true});
  assert.ok(beforeNormal-baseline.player.z>beforeLoaded-loaded.player.z,
    'extra finite inventory affects actual 60 Hz traversal');
  assert.ok(loaded.player.stamina<baseline.player.stamina,
    'extra load costs more stamina only while sprinting');
  assert.equal(loaded.player.charges,kit.maxRounds,'movement never creates or consumes supply');
});

test('BR supply pickup, checkpoint replay and returning reserve restore movement without resource duplication',()=>{
  const game=Sim.newMatch(18602,1);
  game.status='playing';
  const kit=Sim.FIREARMS.carbine;
  const cache=game.loot.find(item=>item.kind==='ammo'&&item.weaponId==='carbine');
  assert.ok(cache);
  cache.x=1.2;cache.z=0;
  assert.equal(Sim.pickup(game),'ammo');
  assert.equal(game.player.charges,kit.maxRounds);
  assert.equal(cache.remaining,0);
  assert.equal(Sim.supplyLoadMobility(game.player)<1,true);
  const restored=Sim.restoreMatch(Sim.snapshotMatch(game));
  assert.equal(Sim.supplyLoadMobility(restored.player),Sim.supplyLoadMobility(game.player));
  for(let i=0;i<90;i++){
    Sim.tick(game,1/60,{forward:true,sprint:true});
    Sim.tick(restored,1/60,{forward:true,sprint:true});
  }
  assert.equal(restored.player.z,game.player.z,'save and restore preserve loaded mobility at 60 Hz');
  assert.equal(restored.player.stamina,game.player.stamina);
  // Return to the same authored cache before depositing; the finite-world
  // interaction is still required and it cannot manufacture extra resources.
  restored.player.x=game.player.x=0;
  restored.player.z=game.player.z=0;
  const before=restored.player.charges+restored.loot[cache.id].remaining;
  const original=game.player.charges+game.loot[cache.id].remaining;
  assert.deepEqual(Sim.depositReserve(game).ok,true);
  assert.deepEqual(Sim.depositReserve(restored).ok,true);
  assert.equal(Sim.supplyLoadMobility(game.player),1);
  assert.equal(game.player.charges+game.loot[cache.id].remaining,original);
  assert.equal(restored.player.charges+restored.loot[cache.id].remaining,before);
  assert.equal(Sim.supplyLoadMobility(Sim.restoreMatch(Sim.snapshotMatch(restored)).player),1);
});

test('BR alternate equipment class load modifiers stay finite and respect unmodified initial loadout',()=>{
  for(const id of Object.keys(Sim.FIREARMS)){
    const kit=Sim.FIREARMS[id],g=Sim.newMatch(18603,1,id);
    assert.equal(Sim.supplyLoadMobility(g.player),1,id+' starts unencumbered');
    g.player.charges=kit.maxRounds;
    assert.ok(Sim.supplyLoadMobility(g.player)>=0.88-1e-12);
    assert.ok(Sim.supplyLoadMobility(g.player)<=1);
  }
});

test('BR desktop HUD reports combined mobility and finite field-load status',()=>{
  const app=fs.readFileSync(path.join(__dirname,'../src/app.js'),'utf8');
  assert.match(app,/FIELD LOAD /);
  assert.match(app,/Game\.injuryMobility\(p\)\*Game\.supplyLoadMobility\(p\)/);
});
