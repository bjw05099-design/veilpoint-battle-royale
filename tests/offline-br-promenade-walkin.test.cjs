'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const Sim=require('../src/simulation.js');
const Challenge=require('../src/br-challenge-code.js');

test('offline BR coastal-promenade start is genuinely walkable in authored common world',()=>{
 const entry=Sim.ENTRY_SITES.promenade;
 assert.deepEqual({x:entry.x,z:entry.z},{x:-28,z:65});
 assert.ok(Math.hypot(entry.x,entry.z)<135,'must start within first match circle');
 for(const seed of [0,4,111,20261109]){
  const game=Sim.newMatch(seed,0,'carbine',false,'promenade');
  assert.equal(game.entrySite,'promenade');
  assert.equal(game.terrainRevision,1);
  assert.equal(game.player.x,entry.x);
  assert.equal(game.player.z,entry.z);
  assert.equal(Sim.blocked(game.player.x,game.player.z,.95,game.obstacles),false);
  const x=game.player.x;
  game.status='playing';
  for(let n=0;n<180;n++){
   Sim.moveEntity(game.player,0,5,1/60,game.obstacles);
   assert.equal(Sim.blocked(game.player.x,game.player.z,.85,game.obstacles),false,
    'every fixed-step player position remains outside solid columns');
   Sim.discoverLandmarks(game);
  }
  assert.ok(Math.abs(game.player.x-x)<1e-8,'physical walk did not teleport sideways');
  assert.ok(game.player.z>=79&&game.player.z<=81,'player actually walked into public promenade');
  assert.ok(Sim.visitedLandmarks(game).some(x=>x.label==='PUBLIC COAST PROMENADE'));
 }
});
test('new public promenade walk-in sector saves, restores and reproduces BR challenge setup',()=>{
 const game=Sim.newMatch(73003,1,'carbine',false,'promenade');
 game.status='playing';
 const saved=Sim.snapshotMatch(game);
 const loaded=Sim.restoreMatch(saved);
 assert.equal(loaded.entrySite,'promenade');
 assert.equal(loaded.player.x,game.player.x);
 assert.equal(loaded.player.z,game.player.z);
 const input={seed:73003,roster:1,weapon:'carbine',site:'promenade',lighting:'day'};
 const code=Challenge.encode(input);
 assert.deepEqual(Challenge.decode(code),input);
 assert.deepEqual(Challenge.decode(Challenge.encode(Challenge.decode(code))),input);
});
test('PC offline menu offers the one new start without changing existing choices or scroll footprint',()=>{
 const root=path.resolve(__dirname,'..');
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 const client=fs.readFileSync(path.join(root,'src/app.js'),'utf8');
 for(const prior of ['central','service','east','west','ferry'])
  assert.match(html,new RegExp('<option value="'+prior+'">'));
 assert.match(html,/<option value="promenade">해안 보행로/);
 assert.match(client,/Game\.ENTRY_SITES/);
 assert.match(client,/simulation\.entrySite/);
 assert.doesNotMatch(html,/<select id="brEntrySite"[^>]*multiple/);
});
