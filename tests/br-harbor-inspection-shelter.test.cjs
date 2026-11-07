'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Sim=require('../src/simulation.js');
const Story=require('../src/story-slice.js');

test('harbor inspection shelter is an enterable three-walled location, not a sealed cube',()=>{
 const world=Sim.newMatch(20261107,0);
 const hut=Sim.INSPECTION_SHELTER;
 assert.deepEqual(hut,{x:-100,z:-132,width:16,depth:10,roofHeight:3.2});
 const walls=world.obstacles.filter(o=>o.type==='dock-inspection-wall');
 assert.deepEqual(walls.map(w=>[w.x,w.z,w.w,w.d]),[
  [-100,-137,16,.8],[-108,-132,.8,10],[-92,-132,.8,10]
 ]);
 assert.equal(Sim.blocked(hut.x,hut.z,.85,world.obstacles),false,
  'the shelter interior must be a real traversable gameplay space');
 assert.equal(Sim.blocked(-108,-132,.85,world.obstacles),true);
 assert.equal(Sim.blocked(-92,-132,.85,world.obstacles),true);
 assert.equal(Sim.lineBlocked(-100,-123,-100,-133,world.obstacles),false,
  'the open entrance must not be blocked by invisible geometry');
 assert.equal(Sim.lineBlocked(-100,-140,-100,-130,world.obstacles),true,
  'the actual back wall blocks view, not an invisible roof collider');
 const player={x:-100,z:-123};
 for(let i=0;i<60;i++)Sim.moveEntity(player,0,-6,1/60,world.obstacles,.85);
 assert.ok(player.z<-128 && player.z>-130,'fixed-step movement enters the station');
 const atDoor={x:-112,z:-132};
 Sim.moveEntity(atDoor,16,0,1,world.obstacles,.85);
 assert.ok(atDoor.x < -109,'side wall remains solid during long movement step');
});

test('new harbor shelter exists in all renderers without invading CH01 collision',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../src/renderer.js'),'utf8');
 assert.match(source,/if\(o\.type==='dock-inspection-wall'\)/);
 assert.match(source,/m\.box\(hut\.x,hut\.roofHeight-\.11,hut\.z/);
 assert.match(source,/type:'dock-inspection-roof'/);
 assert.match(source,/if\(o\.type==='dock-inspection-roof'\)/);
 const native=fs.readFileSync(path.join(__dirname,
  '../Unreal/Veilpoint/Source/Veilpoint/VPWorldBootstrap.cpp'),'utf8');
 for(const coordinates of [
  'FVector(-10000.f,-13700.f,160.f)',
  'FVector(-10800.f,-13200.f,160.f)',
  'FVector(-9200.f,-13200.f,160.f)',
  'FVector(-10000.f,-13200.f,320.f)'
 ])assert.ok(native.includes(coordinates),coordinates);
 assert.equal(Story.createState().world.obstacles.some(o=>o.type==='dock-inspection-wall'),
  false,'BR-only architecture must not become a phantom CH01 collision');
});

test('inspection shelter remains present and enterable after a real BR checkpoint roundtrip',()=>{
 const game=Sim.newMatch(314159,0);
 game.status='playing';
 game.player.x=-100;game.player.z=-132;
 const raw=Sim.snapshotMatch(game);
 const restored=Sim.restoreMatch(raw);
 assert.equal(restored.player.x,-100);
 assert.equal(restored.player.z,-132);
 assert.equal(restored.obstacles.filter(o=>o.type==='dock-inspection-wall').length,3);
 assert.equal(Sim.blocked(restored.player.x,restored.player.z,.85,restored.obstacles),false);
 assert.equal(Sim.snapshotMatch(restored),raw);
});
