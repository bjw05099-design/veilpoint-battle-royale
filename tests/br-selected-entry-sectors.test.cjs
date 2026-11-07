'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Sim=require('../src/simulation.js');

const sites=['central','service','east','west'];
test('four authored BR entry sectors place a real on-foot player on clear terrain',()=>{
 for(const site of sites)for(const rivals of [0,1,4,18]){
  const game=Sim.newMatch(20261107,rivals,'carbine',rivals===1,site);
  const deployment=Sim.ENTRY_SITES[site],p=game.player;
  assert.deepEqual([p.x,p.z],[deployment.x,deployment.z],site);
  assert.equal(game.entrySite,site);
  assert.equal(Sim.blocked(p.x,p.z,.95,game.obstacles),false,site+' cannot start inside solid architecture');
  assert.ok(Math.hypot(p.x,p.z)<170,'all sectors remain within the initial BR boundary');
  assert.equal(game.bots.length,rivals);
  for(const bot of game.bots){
   assert.ok(Math.hypot(bot.x-p.x,bot.z-p.z)>36,site+' opponent must not spawn beside the player');
   assert.equal(Sim.blocked(bot.x,bot.z,.85,game.obstacles),false);
  }
  if(rivals===1)assert.ok(Math.hypot(game.bots[0].x-p.x,game.bots[0].z-p.z)<=65,
    'one opponent encounter should respect the selected entry sector');
  assert.equal(game.loot.length,40,'starting elsewhere cannot mint or remove resources');
 }
});
test('the default central BR stream and seed remain deterministic and unchanged',()=>{
 for(const seed of [4,20261027,20261107]){
  const legacy=Sim.newMatch(seed,4,'carbine');
  const explicit=Sim.newMatch(seed,4,'carbine',false,'central');
  assert.equal(JSON.stringify(explicit),JSON.stringify(legacy));
  assert.equal(explicit.random.getState(),legacy.random.getState());
  assert.equal(JSON.stringify(Sim.newMatch(seed,4,'carbine',false,'east')),
   JSON.stringify(Sim.newMatch(seed,4,'carbine',false,'east')));
 }
 assert.throws(()=>Sim.newMatch(10,0,'carbine',false,'teleport'),/Unknown BR entry sector/);
 assert.throws(()=>Sim.newMatch(10,0,'carbine',false,'__proto__'),/Unknown BR entry sector/);
});
test('BR save and exact restore preserve selected sector while old saves remain readable',()=>{
 for(const site of sites){
  const game=Sim.newMatch(42,4,'carbine',false,site);
  game.status='playing';
  const data=Sim.snapshotMatch(game),saved=JSON.parse(data);
  assert.equal(saved.entrySite,site);
  const restored=Sim.restoreMatch(data);
  assert.equal(restored.entrySite,site);
  assert.deepEqual([restored.player.x,restored.player.z],
   [game.player.x,game.player.z]);
  assert.equal(Sim.snapshotMatch(restored),data);
  if(site==='central'){
   delete saved.entrySite;
   const previous=Sim.restoreMatch(JSON.stringify(saved));
   assert.equal(previous.entrySite,'central');
   assert.deepEqual([previous.player.x,previous.player.z],[0,0]);
  }
  saved.entrySite='made-up';
  assert.throws(()=>Sim.restoreMatch(JSON.stringify(saved)),/Invalid saved BR entry sector/);
 }
});
test('PC selector is functional and remains out of live movement/position commands',()=>{
 const html=fs.readFileSync(path.resolve(__dirname,'../index.html'),'utf8');
 const app=fs.readFileSync(path.resolve(__dirname,'../src/app.js'),'utf8');
 assert.match(html,/<select id="brEntrySite"/);
 for(const site of sites)assert.match(html,new RegExp('value="'+site+'"'));
 assert.match(app,/Game\.newMatch\(seed,rivals,weaponId,rivals===1,sector,lighting\)/);
 assert.match(app,/entrySelect\.value=restored\.entrySite\|\|'central'/);
 assert.match(app,/start\(seed,weapon,rivals,false,simulation\.entrySite\|\|'central',simulation\.lighting\|\|'day'\)/);
 assert.match(app,/memoryOnlyMatch,lastFinishedMatch\.entrySite/);
 assert.doesNotMatch(app,/simulation\.player\.x\s*=\s*entrySelect/);
});
