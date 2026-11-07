'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const Sim=require('../src/simulation.js');
const Visibility=require('../src/visibility.js');
require('../src/renderer.js');
const facing=globalThis.VeilpointActorFacing;
const near=(a,b)=>Math.abs(a-b)<1e-9;
test('visible PC rival orientation maps live 60Hz angles to physical face/body points',()=>{
 assert.equal(typeof facing,'function');
 const zero=facing({x:12,z:-10,angle:0});
 assert.ok(near(zero.yaw,0));
 assert.ok(near(zero.front.x,12)&&near(zero.front.z,-10.28));
 assert.ok(near(zero.left.x,11.82)&&near(zero.right.x,12.18));
 const east=facing({x:12,z:-10,angle:Math.PI/2});
 assert.ok(near(east.front.x,12.28)&&near(east.front.z,-10));
 assert.ok(near(east.left.z,-10.18)&&near(east.right.z,-9.82));
 const west=facing({x:12,z:-10,angle:-Math.PI/2});
 assert.ok(near(west.front.x,11.72)&&near(west.front.z,-10));
 const before={x:4,z:3,angle:Math.PI/3};
 facing(before);
 assert.deepEqual(before,{x:4,z:3,angle:Math.PI/3},
  'renderer must never mutate the authoritative AI world or checkpoint');
 assert.ok(Number.isFinite(facing({x:0,z:0,angle:Infinity}).yaw));
});
test('world angle changes appearance but not actor physical location, resources or sight gate',()=>{
 const game=Sim.newMatch(4512,1);
 game.player.yaw=0;game.player.x=0;game.player.z=0;
 game.obstacles=[];
 game.loot=[];
 const bot=game.bots[0];
 bot.x=0;bot.z=-12;bot.angle=0;
 const viewed=Visibility.planVisible(game);
 assert.equal(viewed.bots.length,1);
 assert.equal(viewed.bots[0].entity,bot);
 const oldPos={x:bot.x,z:bot.z,health:bot.health,charges:bot.charges};
 const start=facing(bot);
 bot.angle=Math.PI/2;
 const turned=facing(bot);
 assert.notDeepEqual(start.front,turned.front);
 assert.deepEqual({x:bot.x,z:bot.z,health:bot.health,charges:bot.charges},oldPos);
 game.obstacles=[{x:0,z:-6,w:4,d:2}];
 assert.equal(Visibility.planVisible(game).bots.length,0,
  'world geometry still blocks enemy silhouettes and direction disclosure');
});
test('both PC renderer paths rotate only observed actors, without screen-space radar',()=>{
 const source=fs.readFileSync(path.resolve(__dirname,'../src/renderer.js'),'utf8');
 assert.match(source,/for\(const \{entity:b\} of plan\.bots\)objects\.push\(\{x:b\.x,z:b\.z,angle:b\.angle/);
 assert.match(source,/const heading=o\.type==='bot'\?actorFacing\(o\):null/);
 assert.match(source,/mesh\.boxYaw\(x,0\.06,z,\.7,1\.3,\.45,angle,c\)/);
 assert.match(source,/mesh\.boxYaw\(facing\.front\.x,1\.49,facing\.front\.z/);
 assert.match(source,/if\(heading\)\{/);
 assert.doesNotMatch(source,/const angle = state\.bots/);
});
