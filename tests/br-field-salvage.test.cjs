'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Sim=require('../src/simulation.js');
const Visibility=require('../src/visibility.js');

function emptyGroundCaches(game){
  for(const item of game.loot){item.remaining=0;item.picked=true;}
}
function placeWithinReach(game,bot){
  const options=[[1,0],[-1,0],[0,1],[0,-1]];
  const point=options.map(([dx,dz])=>({x:bot.x+dx,z:bot.z+dz}))
    .find(pos=>!Sim.blocked(pos.x,pos.z,.85,game.obstacles)&&
      !Sim.lineBlocked(pos.x,pos.z,bot.x,bot.z,game.obstacles));
  assert.ok(point,'defeated rival must have a physically accessible side');
  game.player.x=point.x;game.player.z=point.z;
  game.player.yaw=Math.atan2(bot.x-point.x,-(bot.z-point.z));
  game.player.pitch=0;
}
function defeatedFixture(seed=20261103,weaponId='carbine'){
  const game=Sim.newMatch(seed,2,weaponId),bot=game.bots[0];
  game.status='playing';emptyGroundCaches(game);
  bot.health=0;bot.alive=false;bot.loaded=4;bot.charges=16;
  placeWithinReach(game,bot);
  return {game,bot};
}

test('BR: defeated rival exposes a visible finite ground pouch; PC E transfers reserve, not duplicates',()=>{
  const {game,bot}=defeatedFixture();
  const pouch=Sim.nearestReachablePickup(game);
  assert.equal(pouch.id,'field-'+bot.id);
  assert.equal(pouch.kind,'ammo');
  assert.equal(pouch.fieldPouch,true);
  assert.equal(pouch.remaining,12);
  const plan=Visibility.planVisible(game);
  assert.ok(plan.loot.some(item=>item.entity.id===pouch.id&&item.entity.fieldPouch),'3D scene must display the distinct interactable pouch');
  game.player.charges=48;
  const conserved=game.player.charges+bot.charges;
  assert.equal(Sim.pickup(game),'ammo');
  assert.equal(game.player.charges,60);
  assert.equal(bot.charges,4);
  assert.equal(bot.loaded,4);
  assert.equal(game.player.charges+bot.charges,conserved);
  assert.equal(Sim.nearestReachablePickup(game),null);
  assert.ok(!Visibility.planVisible(game).loot.some(item=>item.entity.id===pouch.id));
  assert.equal(Sim.pickup(game),null);
  assert.equal(game.player.charges+bot.charges,conserved);
});

test('BR: partially full carry leaves finite reserve, with no second-transfer duplication',()=>{
  const {game,bot}=defeatedFixture(20261104);
  game.player.charges=58;
  assert.equal(Sim.pickup(game),'ammo');
  assert.equal(game.player.charges,60);
  assert.equal(bot.charges,14);
  assert.equal(Sim.nearestReachablePickup(game).remaining,10);
  game.player.charges=50; // Fixture: ten rounds spent before returning to the pouch.
  assert.equal(Sim.pickup(game),'ammo');
  assert.equal(game.player.charges,60);
  assert.equal(bot.charges,4);
  assert.equal(Sim.pickup(game),null);
});

test('BR: fixed 60Hz and checkpoint restore retain consumed rival inventory',()=>{
  const make=()=>{
    const {game,bot}=defeatedFixture(20261105);
    game.player.charges=48;
    for(let i=0;i<60;i++)Sim.tick(game,1/60,{});
    assert.equal(game.status,'playing');
    placeWithinReach(game,bot);
    assert.equal(Sim.pickup(game),'ammo');
    return game;
  };
  const a=make(),b=make();
  assert.equal(Sim.snapshotMatch(a),Sim.snapshotMatch(b));
  const loaded=Sim.restoreMatch(Sim.snapshotMatch(a));
  assert.equal(loaded.bots[0].charges,4);
  assert.equal(Sim.nearestReachablePickup(loaded),null);
  assert.equal(Sim.pickup(loaded),null);
  for(let i=0;i<60;i++){Sim.tick(a,1/60,{});Sim.tick(loaded,1/60,{});}
  assert.equal(Sim.snapshotMatch(a),Sim.snapshotMatch(loaded));
});

test('BR: no pouch from boundary rulings, living rivals, empty reserves or CH01 actors',()=>{
  const {game,bot}=defeatedFixture(20261106);
  bot.alive=true;bot.health=100;
  assert.equal(Sim.nearestReachablePickup(game),null);
  bot.alive=false;bot.disqualified=true;
  assert.equal(Sim.nearestReachablePickup(game),null);
  bot.disqualified=false;bot.charges=bot.loaded;
  assert.equal(Sim.nearestReachablePickup(game),null);
  bot.charges=16;game.scene='nahrin';
  assert.equal(Sim.nearestReachablePickup(game),null);
  assert.equal(Visibility.planVisible(game).loot.length,0);
});

test('BR: incompatible equipment cannot recover rival ammunition; wall and distance still block',()=>{
  const {game,bot}=defeatedFixture(20261107,'shotgun');
  assert.equal(Sim.nearestReachablePickup(game).weaponId,'carbine');
  const total=bot.charges;
  assert.equal(Sim.pickup(game),null);
  assert.equal(bot.charges,total);
  game.player.weaponId='carbine';
  game.player.x=bot.x+8;game.player.z=bot.z+8;
  assert.equal(Sim.nearestReachablePickup(game),null);
  assert.equal(bot.charges,total);
});

test('BR: real player shot makes a finite field pouch available after an elimination',()=>{
  const game=Sim.newMatch(20261108,2,'carbine'),bot=game.bots[0];
  game.status='playing';emptyGroundCaches(game);
  bot.health=1;bot.charges=16;bot.loaded=4;
  const offsets=[[0,4],[4,0],[0,-4],[-4,0]];
  const spot=offsets.map(([dx,dz])=>({x:bot.x+dx,z:bot.z+dz}))
    .find(p=>!Sim.blocked(p.x,p.z,.85,game.obstacles)&&
      !Sim.lineBlocked(p.x,p.z,bot.x,bot.z,game.obstacles)&&
      game.bots.slice(1).every(other=>Math.hypot(other.x-p.x,other.z-p.z)>3));
  assert.ok(spot);
  Object.assign(game.player,spot);
  game.player.yaw=Math.atan2(bot.x-spot.x,-(bot.z-spot.z));
  game.player.pitch=0;game.elapsed=1;
  const shot=Sim.tag(game);
  assert.equal(shot.hit,true);
  assert.equal(shot.elimination,true);
  assert.equal(bot.alive,false);
  placeWithinReach(game,bot);
  assert.equal(Sim.nearestReachablePickup(game).remaining,12);
  assert.equal(Sim.pickup(game),'ammo');
  assert.equal(bot.charges,4);
});
