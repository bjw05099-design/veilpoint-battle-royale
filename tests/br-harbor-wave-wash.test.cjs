'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const Sim=require('../src/simulation.js');
const pad=Sim.WET_LOADING_PAD;
test('periodic low quay wash derives only from the 60Hz elapsed clock and observed position',()=>{
 const near={x:pad.x,z:pad.z},far={x:pad.x+pad.width,z:pad.z};
 for(const time of [0,11.99,18,44.99,45,56.99,63]){
  assert.equal(Sim.harborWaveWash(time,near).active,false,time);
  assert.equal(Sim.harborWaveWash(time,near).mobility,1,time);
 }
 for(const time of [12,13,17.99,57,58,62.99]){
  assert.equal(Sim.harborWaveWash(time,near).active,true,time);
  assert.equal(Sim.harborWaveWash(time,near).mobility,.78,time);
  assert.equal(Sim.harborWaveWash(time,far).mobility,1,
    'wave cannot slow players in other streets');
 }
 assert.equal(Sim.harborWaveWash(12,near).remaining,6);
 assert.equal(Sim.harborWaveWash(18,near).remaining,39);
 assert.equal(Sim.harborWaveWash(Infinity,near).active,false);
});
test('actual BR fixed-step movement is slower only while wave wash reaches the apron',()=>{
 const setup=(elapsed)=>{
  const s=Sim.newMatch(229,1,'carbine',false,'central','day');
  s.status='playing';s.elapsed=elapsed;
  s.player.x=pad.x;s.player.z=pad.z;s.player.yaw=0;s.player.stamina=100;
  assert.equal(Sim.blocked(s.player.x,s.player.z,.85,s.obstacles),false);
  assert.equal(Sim.blocked(s.player.x,s.player.z-1,.85,s.obstacles),false);
  return s;
 };
 const dry=setup(1),wet=setup(13);
 const beforeDry=dry.player.z,beforeWet=wet.player.z;
 Sim.tick(dry,1/60,{forward:true});
 Sim.tick(wet,1/60,{forward:true});
 const travelDry=Math.abs(dry.player.z-beforeDry);
 const travelWet=Math.abs(wet.player.z-beforeWet);
 assert.ok(travelDry>.01,'player physically traverses the original quay');
 assert.ok(travelWet>0&&travelWet<travelDry*.80,
   'shallow wash reduces distance at identical fixed-step input');
 const state=Sim.snapshotMatch(wet),restored=Sim.restoreMatch(state);
 assert.equal(Sim.snapshotMatch(restored),state);
 assert.equal(Sim.harborWaveWash(restored.elapsed,restored.player).mobility,.78);
 const before=restored.player.z;
 Sim.tick(restored,0,{forward:true});
 Sim.tick(restored,NaN,{forward:true});
 assert.equal(restored.player.z,before,'invalid time must not move the player');
 assert.equal(Sim.snapshotMatch(restored),state);
});
test('both rendering paths and PC HUD use the identical world-clock wash rule',()=>{
 const render=fs.readFileSync(path.resolve(__dirname,'../src/renderer.js'),'utf8');
 const app=fs.readFileSync(path.resolve(__dirname,'../src/app.js'),'utf8');
 assert.match(render,/type:'harbor-wash'/,'Canvas renders the wash as an observed surface');
 assert.match(render,/o\.type==='harbor-wash'\?'#527e88'/);
 assert.match(render,/mesh\.box\(pad\.x,\.085,pad\.z,pad\.width,\.012,pad\.depth/);
 assert.match(render,/global\.VeilpointSim\.harborWaveWash\(t\)\.active/);
 assert.match(app,/Game\.harborWaveWash\(s\.elapsed,p\)\.active/);
 assert.match(app,/WAVE WASH · FOOTING 67%/);
});
