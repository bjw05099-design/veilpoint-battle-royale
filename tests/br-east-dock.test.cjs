'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Sim=require('../src/simulation.js');
const Story=require('../src/story-slice.js');

test('east dock structures have matching solid footprints in the live BR world',()=>{
 const game=Sim.newMatch(20261104,0);
 const dock=game.obstacles.filter(o=>o.type.startsWith('dock-'));
 assert.equal(dock.length,5);
 assert.equal(dock.filter(o=>o.type==='dock-warehouse').length,2);
 assert.equal(dock.filter(o=>o.type==='dock-container').length,2);
 assert.equal(dock.filter(o=>o.type==='dock-crane').length,1);
 for(const o of dock){
  assert.equal(Sim.blocked(o.x,o.z,.85,game.obstacles),true);
  assert.ok(o.h>0&&o.w>0&&o.d>0);
 }
 assert.equal(Sim.blocked(112,-121,.85,game.obstacles),false,
  'pedestrian lane between warehouse frontages must remain accessible');
 assert.equal(Sim.blocked(135,-121,.85,game.obstacles),false,
  'east dock access route must not be walled off');
 assert.equal(Story.createState().world.obstacles.some(o=>o.type.startsWith('dock-')),false,
  'BR map extension must not mutate CH01 collision geometry');
});

test('east dock lane is traversable at fixed 60 Hz and replay survives a checkpoint',()=>{
 const game=Sim.newMatch(20261105,0);game.status='playing';
 game.player.x=110;game.player.z=-121;game.player.yaw=Math.PI/2;
 const restored=Sim.restoreMatch(Sim.snapshotMatch(game));
 for(let i=0;i<180;i++){
  Sim.tick(game,1/60,{forward:true});
  Sim.tick(restored,1/60,{forward:true});
 }
 assert.ok(game.player.x>125,'player crosses the new dock access lane');
 assert.equal(Sim.snapshotMatch(game),Sim.snapshotMatch(restored));
});

test('dock structures use visible authored WebGL meshes instead of unrendered collision-only props',()=>{
 const renderer=fs.readFileSync(path.join(__dirname,'../src/renderer.js'),'utf8');
 for(const type of ['dock-warehouse','dock-container','dock-crane'])
  assert.ok(renderer.includes("o.type==='"+type+"'"),type+' must be rendered');
});
