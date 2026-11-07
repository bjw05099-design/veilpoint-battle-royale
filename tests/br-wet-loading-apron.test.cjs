'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Sim=require('../src/simulation.js');

function oneStep(x,z){
 const game=Sim.newMatch(20261107,1);
 game.player.x=x;game.player.z=z;game.player.yaw=0;
 const before=game.player.z;
 Sim.tick(game,1/60,{forward:true});
 return {game,distance:before-game.player.z};
}
test('rain-soaked loading apron is a real, bounded 60Hz traversal surface',()=>{
 const pad=Sim.WET_LOADING_PAD;
 assert.deepEqual({x:pad.x,z:pad.z,width:pad.width,depth:pad.depth},
  {x:35,z:-40,width:14,depth:18});
 assert.deepEqual(Sim.wetApronFooting({x:35,z:-40}),{wet:true,mobility:.86});
 assert.deepEqual(Sim.wetApronFooting({x:0,z:0}),{wet:false,mobility:1});
 assert.equal(Sim.wetApronFooting({x:Infinity,z:-40}).wet,false);
 const wet=oneStep(35,-40),dry=oneStep(35,-60);
 assert.ok(wet.distance>0&&dry.distance>wet.distance);
 assert.ok(Math.abs(wet.distance/dry.distance-.86)<.002,
  'the actual displacement, not an overlay-only label, must reflect wet footing');
 assert.equal(Sim.wetApronFooting(wet.game.player).wet,true);
});
test('the wet loading apron is visible in both render paths and in PC HUD',()=>{
 const renderer=fs.readFileSync(path.resolve(__dirname,'../src/renderer.js'),'utf8');
 const app=fs.readFileSync(path.resolve(__dirname,'../src/app.js'),'utf8');
 assert.match(renderer,/m\.box\(pad\.x,\.045,pad\.z,pad\.width/);
 assert.match(renderer,/type:'wet-apron'/);
 assert.match(app,/Game\.wetApronFooting\(p\)\.wet/);
 assert.match(app,/WET LOADING APRON/);
});
test('saved BR clock and player location retain derived apron footing on restore',()=>{
 const {game}=oneStep(35,-40);
 const raw=Sim.snapshotMatch(game);
 const restored=Sim.restoreMatch(raw);
 assert.equal(restored.player.x,game.player.x);
 assert.equal(restored.player.z,game.player.z);
 assert.equal(restored.elapsed,game.elapsed);
 assert.equal(Sim.wetApronFooting(restored.player).wet,true);
 assert.equal(Sim.wetApronFooting(restored.player).mobility,.86);
});
