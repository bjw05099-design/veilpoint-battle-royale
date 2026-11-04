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

test('BR final placement is undefined in active play and never first after a loss',()=>{
 const game=active(20261029,3);
 assert.equal(Sim.getFinalPlacement(game),null);
 assert.equal(Sim.getAliveCount(game),4);
 Sim.receiveDamage(game,100);
 assert.equal(game.status,'lost');
 assert.equal(Sim.getAliveCount(game),3);
 assert.equal(Sim.getFinalPlacement(game),4);
 for(const b of game.bots){b.alive=false;b.health=0;}
 assert.equal(Sim.getFinalPlacement(game),2,'a simultaneous knockout cannot be champion');
 const win=active(20261030,1);
 win.bots[0].alive=false;win.bots[0].health=0;
 Sim.tick(win,1/60,{});
 assert.equal(win.status,'won');
 assert.equal(Sim.getFinalPlacement(win),1);
});

test('BR checkpoint size limit protects offline resume without rejecting 20-opponent saves',()=>{
 const game=active(20261031,20);
 const saved=Sim.snapshotMatch(game);
 assert.ok(saved.length<65536,'normal maximum-bot save fits bounded storage');
 assert.equal(Sim.snapshotMatch(Sim.restoreMatch(saved)),saved);
 const padded=saved.slice(0,-1)+',"padding":"'+ 'x'.repeat(65536)+'"}';
 assert.throws(()=>Sim.restoreMatch(padded),/BR checkpoint too large/);
 assert.throws(()=>Sim.restoreMatch(' '.repeat(65537)),/BR checkpoint too large/);
});

test('BR field bookmark rewinds RNG, actors, zone and finite inventory with fixed 60Hz replay',()=>{
 const original=active(20261105,1);
 for(let i=0;i<45;i++)Sim.tick(original,1/60,{forward:i%4===0});
 assert.equal(original.status,'playing');
 const bookmark=Sim.snapshotMatch(original);
 const expected=Sim.restoreMatch(bookmark);
 for(let i=0;i<80;i++)Sim.tick(original,1/60,{right:i%5===0});
 const rewound=Sim.restoreFieldBookmark(original,bookmark);
 assert.equal(Sim.snapshotMatch(rewound),bookmark,'all world state, including RNG, is restored');
 for(let i=0;i<90;i++){
  const input={forward:i%3===0,left:i%7===0};
  Sim.tick(rewound,1/60,input);Sim.tick(expected,1/60,input);
  assert.equal(Sim.snapshotMatch(rewound),Sim.snapshotMatch(expected),'replay diverged at step '+i);
  if(rewound.status!=='playing')break;
 }
});

test('BR field bookmark refuses other arena, future timeline and finished matches',()=>{
 const live=active(20261106,1),foreign=active(20261107,1);
 assert.throws(()=>Sim.restoreFieldBookmark(live,Sim.snapshotMatch(foreign)),/another round/);
 const later=Sim.snapshotMatch(live);
 Sim.tick(live,1/60,{forward:true});
 assert.throws(()=>Sim.restoreFieldBookmark(Sim.restoreMatch(later),Sim.snapshotMatch(live)),/future step/);
 const over=active(20261108,1);
 Sim.receiveDamage(over,100);
 assert.throws(()=>Sim.restoreFieldBookmark(over,later),/active BR/);
});

test('BR previous-generation recovery retains seeded world and never accepts malformed saves',()=>{
 const live=active(20261109,1);
 for(let i=0;i<110;i++)Sim.tick(live,1/60,{forward:i%9===0});
 const older=Sim.snapshotMatch(live);
 for(let i=0;i<90;i++)Sim.tick(live,1/60,{left:i%13===0});
 const latest=Sim.snapshotMatch(live);
 const healthy=Sim.recoverMatch(latest,older);
 assert.equal(healthy.source,'primary');
 assert.equal(Sim.snapshotMatch(healthy.state),latest);
 const recovered=Sim.recoverMatch('{broken-json',older);
 assert.equal(recovered.source,'backup');
 assert.equal(Sim.snapshotMatch(recovered.state),older);
 const replay=Sim.restoreMatch(older);
 for(let i=0;i<75;i++){
  const input={forward:i%4===0,right:i%6===0};
  Sim.tick(recovered.state,1/60,input);Sim.tick(replay,1/60,input);
  assert.equal(Sim.snapshotMatch(recovered.state),Sim.snapshotMatch(replay));
 }
 assert.throws(()=>Sim.recoverMatch('corrupt','also corrupt'),RangeError);
 assert.equal(Sim.recoverMatch(null,null),null);
});

test('BR voluntary withdrawal ends eligibility without changing health or finite resources',()=>{
 const game=active(20261105,4);
 const before=Sim.snapshotMatch(game),health=game.player.health,charges=game.player.charges;
 const result=Sim.forfeitMatch(game);
 assert.equal(result.ok,true);
 assert.equal(result.placement,5);
 assert.equal(game.status,'lost');
 assert.equal(game.player.alive,false);
 assert.equal(game.player.health,health,'withdrawal is not simulated injury');
 assert.equal(game.player.charges,charges);
 assert.equal(Sim.getFinalPlacement(game),5);
 assert.equal(Sim.forfeitMatch(game).ok,false,'withdrawal is a one-time terminal transition');
 assert.throws(()=>Sim.snapshotMatch(game),RangeError,'terminal rounds cannot be saved as active');
 const resumed=Sim.restoreMatch(before);
 assert.equal(resumed.status,'playing','pre-withdrawal checkpoint is a real active world');
 assert.equal(Sim.forfeitMatch(resumed).ok,true);
});
