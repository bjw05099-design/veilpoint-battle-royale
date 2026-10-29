'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Sim=require('../src/simulation.js');

function active(seed=4411,count=10){const game=Sim.newMatch(seed,count,'compact');game.status='playing';return game;}
const parsed=game=>JSON.parse(Sim.snapshotMatch(game));

test('BR checkpoint resumes the same 60Hz world, finite resources and random stream',()=>{
 const game=active();
 for(let i=0;i<170;i++){
  if(i===18)Sim.tag(game);
  if(i===60)Sim.reload(game);
  Sim.tick(game,1/60,{forward:i%7<3,crouch:i%11===0});
 }
 assert.equal(game.status,'playing');
 const saved=Sim.snapshotMatch(game),restored=Sim.restoreMatch(saved);
 assert.deepEqual(parsed(restored),JSON.parse(saved));
 for(let i=0;i<600;i++){
  if(i%45===0){Sim.tag(game);Sim.tag(restored);}
  if(i%91===0){Sim.reload(game);Sim.reload(restored);}
  const input={forward:i%7<3,right:i%5===0,sprint:i%23<4};
  Sim.tick(game,1/60,input);Sim.tick(restored,1/60,input);
  assert.deepEqual(parsed(restored),parsed(game),`world diverged at tick ${i}`);
  if(game.status!=='playing')break;
 }
});

test('BR checkpoint preserves partial ammunition caches, injury and reload hesitation without creating rounds',()=>{
 const game=active(7,2);game.player.charges=20;game.player.loaded=4;
 game.player.health=56;game.player.stress=85;
 game.loot[0].x=.6;game.loot[0].z=0;
 game.loot[0].weaponId='compact';
 assert.equal(Sim.pickup(game),'ammo');
 assert.equal(game.player.charges,32);
 assert.equal(game.loot[0].picked,true);
 const r=Sim.reload(game);assert.equal(r.ok,true);assert.equal(r.hesitation,true);
 const restored=Sim.restoreMatch(Sim.snapshotMatch(game));
 assert.equal(restored.player.health,56);
 assert.equal(restored.player.reloadHesitation,true);
 assert.equal(restored.loot[0].remaining,0);
 assert.equal(restored.player.charges,32);
 for(let i=0;i<180;i++)Sim.advanceReload(restored,1/60);
 assert.equal(restored.player.loaded,18);
 assert.equal(restored.player.charges,32);
});

test('BR checkpoints discard injected legacy shields and reject impossible world/resource edits',()=>{
 const game=active(88,4);
 game.player.shield=999;game.player.magicBuff=true;
 const snapshot=parsed(game);
 assert.equal('shield' in snapshot.player,false);
 assert.equal('magicBuff' in snapshot.player,false);
 const restored=Sim.restoreMatch(snapshot);
 assert.equal('shield' in restored.player,false);
 const mutate=(fn)=>{const value=structuredClone(snapshot);fn(value);assert.throws(()=>Sim.restoreMatch(value),RangeError);};
 mutate(s=>s.version=2);
 mutate(s=>s.rngState=0);
 mutate(s=>s.player.charges=100000);
 mutate(s=>s.player.loaded=s.player.charges+1);
 mutate(s=>s.player.health=-10);
 mutate(s=>s.bots[0].charges=999);
 mutate(s=>s.bots[0].lastSeenUntil=Infinity);
 mutate(s=>s.loot[0].remaining=900);
 mutate(s=>s.zone.radius=999);
 mutate(s=>s.message='<'.repeat(121));
 assert.throws(()=>Sim.restoreMatch('{broken json'),RangeError);
 assert.throws(()=>Sim.snapshotMatch(Sim.newMatch(3,1)),RangeError);
});

test('BR checkpoint accepts legitimate long inactive target timers and Date.now seeds',()=>{
 const game=active(Date.now(),2);game.bots[0].actionTime=-100;
 const saved=Sim.snapshotMatch(game);
 assert.equal(Sim.restoreMatch(saved).bots[0].actionTime,-100);
});


test('BR checkpoint refuses wall-spawn, impossible loot and fabricated eliminations', () => {
 const game=active(812,3),original=parsed(game);
 const wall=game.obstacles[0];
 const mutate=(change)=>{
  const snapshot=structuredClone(original);
  change(snapshot);
  assert.throws(()=>Sim.restoreMatch(JSON.stringify(snapshot)),RangeError);
 };
 mutate(s=>{s.player.x=wall.x;s.player.z=wall.z;});
 mutate(s=>{s.bots[0].x=wall.x;s.bots[0].z=wall.z;});
 mutate(s=>{s.loot[0].x=wall.x;s.loot[0].z=wall.z;});
 mutate(s=>{s.kills=1;});
 // A rival can die without the captain receiving a kill credit.
 game.bots[0].alive=false;game.bots[0].health=0;
 assert.doesNotThrow(()=>Sim.restoreMatch(Sim.snapshotMatch(game)));
});
