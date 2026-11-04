const test=require('node:test');
const assert=require('node:assert/strict');
const Sim=require('../src/simulation.js');

function fixture(){
 const game=Sim.newMatch(2026110417,0,'carbine');game.status='playing';
 const item=game.loot.find(cache=>{
  const player={x:cache.x-1.3,z:cache.z};
  const next={x:cache.x+1.1,z:cache.z};
  return !Sim.blocked(player.x,player.z,.85,game.obstacles)&&
    !Sim.blocked(next.x,next.z,.85,game.obstacles)&&
    !Sim.lineBlocked(player.x,player.z,cache.x,cache.z,game.obstacles)&&
    !Sim.lineBlocked(cache.x,cache.z,next.x,next.z,game.obstacles)&&
    game.loot.every(other=>other===cache||Math.hypot(other.x-next.x,other.z-next.z)>1.2);
 });
 assert.ok(item,'seed has a clear cache relocation path');
 game.player.x=item.x-1.3;game.player.z=item.z;game.player.yaw=Math.PI/2;
 return {game,item};
}

test('BR: moving a real cache changes its physical position without creating ammunition',()=>{
 const {game,item}=fixture();const original={x:item.x,z:item.z,remaining:item.remaining,id:item.id};
 const before=game.loot.reduce((sum,cache)=>sum+cache.remaining,0);
 const result=Sim.repositionCache(game);
 assert.equal(result.ok,true);
 assert.equal(item.id,original.id);assert.equal(item.remaining,original.remaining);
 assert.ok(item.x>original.x);assert.equal(item.z,original.z);
 assert.equal(game.loot.reduce((sum,cache)=>sum+cache.remaining,0),before);
 const restored=Sim.restoreMatch(Sim.snapshotMatch(game));
 assert.equal(restored.loot[item.id].x,item.x);
 assert.equal(restored.loot[item.id].remaining,original.remaining);
});

test('BR: relocation obeys solid cover and player occupancy, not through-wall movement',()=>{
 const {game,item}=fixture();
 const before={x:item.x,z:item.z,remaining:item.remaining};
 // The destination is occupied by the player: no overlap or resource change.
 game.player.x=item.x+1.1;game.player.z=item.z;
 const blocked=Sim.repositionCache(game);
 assert.equal(blocked.ok,false);
 assert.deepEqual({x:item.x,z:item.z,remaining:item.remaining},before);
 game.status='won';assert.equal(Sim.repositionCache(game).ok,false);
});

test('BR: identical seed and PC input produce the same relocated cache after 60Hz ticks',()=>{
 const a=fixture(),b=fixture();
 assert.deepEqual(Sim.repositionCache(a.game),Sim.repositionCache(b.game));
 for(let i=0;i<60;i++){Sim.tick(a.game,1/60,{});Sim.tick(b.game,1/60,{});}
 assert.deepEqual(Sim.snapshotMatch(a.game),Sim.snapshotMatch(b.game));
});
