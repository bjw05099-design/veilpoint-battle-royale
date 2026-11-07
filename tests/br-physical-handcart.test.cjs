'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const Sim=require('../src/simulation.js');
const Visibility=require('../src/visibility.js');

function dock(seed=71226,bots=1){
 const game=Sim.newMatch(seed,bots);
 game.status='playing';
 game.player.x=129.7;game.player.z=-121;game.player.yaw=Math.PI/2;
 return game;
}
function body(g){return g.obstacles.find(o=>o.routeId==='br-dock-handcart');}

test('new BR handcart is a real collision body at the east harbor, not a remote pickup',()=>{
 const game=dock(),cart=body(game);
 assert.deepEqual([cart.x,cart.z,cart.w,cart.d],[132,-121,1.4,.9]);
 assert.equal(Sim.blocked(132,-121,.85,game.obstacles),true);
 assert.equal(Sim.handcartStatus(game).near,true);
 const far=Sim.newMatch(11,0);
 far.status='playing';
 assert.deepEqual(Sim.operateHandcart(far),{ok:false,reason:'out_of_reach'});
 const before=JSON.stringify(game.handcart);
 game.player.yaw=0;
 assert.equal(Sim.operateHandcart(game).reason,'stand_behind_cart');
 assert.equal(JSON.stringify(game.handcart),before);
 game.player.yaw=Math.PI/2;
 assert.deepEqual(Sim.operateHandcart(game),{ok:true,action:'grip'});
 assert.equal(game.handcart.engaged,true);
});
test('handcart and physically walking player progress together over 60Hz ticks',()=>{
 const g=dock();assert.equal(Sim.operateHandcart(g).ok,true);
 const firstX=body(g).x,playerX=g.player.x;
 Sim.tick(g,1/60,{});
 assert.equal(body(g).x,firstX,'E alone never teleports a piece of cargo');
 assert.equal(g.player.x,playerX);
 for(let i=0;i<60;i++)Sim.tick(g,1/60,{forward:true});
 assert.ok(Math.abs(body(g).x-133.6)<1e-7);
 assert.ok(Math.abs(g.player.x-(playerX+1.6))<1e-7);
 assert.ok(Math.abs(g.player.x-body(g).x+2.3)<1e-7);
 assert.deepEqual(Sim.operateHandcart(g),{ok:true,action:'release'});
 assert.equal(g.handcart.engaged,false);
 assert.equal(g.handcart.dirX,0);
 const stopped=body(g).x;
 Sim.tick(g,1/60,{});
 assert.equal(body(g).x,stopped);
});
test('real obstacles and another standing actor stop the physical handcart',()=>{
 const obstacle=dock();
 assert.equal(Sim.operateHandcart(obstacle).ok,true);
 obstacle.obstacles.push({x:133.8,z:-121,w:1,d:2,h:3,type:'test-block'});
 for(let i=0;i<200;i++)Sim.tick(obstacle,1/60,{forward:true});
 assert.ok(body(obstacle).x<133,'cart cannot pass through a fixed loading wall');
 const previousX=body(obstacle).x,previousPlayer=obstacle.player.x;
 Sim.tick(obstacle,1/60,{forward:true});
 assert.equal(body(obstacle).x,previousX);
 assert.equal(obstacle.player.x,previousPlayer);
 const withRival=dock(71227,1);
 withRival.bots[0].x=133.8;withRival.bots[0].z=-121;
 assert.equal(Sim.operateHandcart(withRival).ok,true);
 for(let i=0;i<100;i++)Sim.advanceHandcart(withRival,1/60,{forward:true});
 assert.ok(body(withRival).x<133,'cart must stop for another person');
});
test('handcart checkpoint restores exact physical progress and resumes deterministically',()=>{
 const g=dock(71228,1);
 assert.equal(Sim.operateHandcart(g).ok,true);
 for(let i=0;i<30;i++)Sim.tick(g,1/60,{forward:true});
 const saved=Sim.snapshotMatch(g),restored=Sim.restoreMatch(saved);
 assert.deepEqual(restored.handcart,g.handcart);
 assert.equal(body(restored).x,body(g).x);
 assert.equal(Sim.snapshotMatch(restored),saved);
 for(let i=0;i<80;i++){
  Sim.tick(g,1/60,{forward:true});
  Sim.tick(restored,1/60,{forward:true});
 }
 assert.equal(Sim.snapshotMatch(restored),Sim.snapshotMatch(g));
});
test('old active BR saves do not acquire an unexpected cart inside a previous actor spawn',()=>{
 const g=dock(71229),raw=JSON.parse(Sim.snapshotMatch(g));
 delete raw.handcart;
 const older=Sim.restoreMatch(JSON.stringify(raw));
 assert.equal(older.handcart,null);
 assert.equal(body(older),undefined);
 assert.equal(Sim.handcartStatus(older).near,false);
 assert.equal(Sim.restoreMatch(Sim.snapshotMatch(older)).handcart,null);
 const bad=JSON.parse(Sim.snapshotMatch(g));
 bad.handcart={...bad.handcart,dirX:2};
 assert.throws(()=>Sim.restoreMatch(JSON.stringify(bad)),/handcart/i);
 bad.handcart={...g.handcart,x:113,z:-137};
 assert.throws(()=>Sim.restoreMatch(JSON.stringify(bad)),/handcart/i);
 g.handcart.dirX=2;
 assert.throws(()=>Sim.snapshotMatch(g),/handcart/i);
});
test('the current handcart is visible on both renderers with the same live body and no player radar',()=>{
 const game=dock(71230),render=fs.readFileSync(path.join(__dirname,'../src/renderer.js'),'utf8');
 const app=fs.readFileSync(path.join(__dirname,'../src/app.js'),'utf8');
 const visible=Visibility.planVisible(game,16/9);
 assert.equal(visible.handcarts.length,1);
 assert.equal(visible.handcarts[0],body(game));
 game.player.yaw=-Math.PI/2;
 assert.equal(Visibility.planVisible(game,16/9).handcarts.length,0);
 assert.match(render,/for\(const cart of plan\.handcarts\|\|\[\]\)/);
 assert.match(render,/o\.routeId==='br-dock-handcart'\)return/);
 assert.match(render,/o\.type==='dock-handcart'\?'dock-handcart'/);
 assert.match(app,/Game\.operateHandcart\(simulation\)/);
 assert.match(app,/Game\.handcartStatus\(s\)/);
 assert.match(app,/RELEASE DOCK HANDCART/);
 assert.ok(require('../src/story-slice.js').createState().world.obstacles.every(o=>o.routeId!=='br-dock-handcart'));
});
