'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const Story=require('../src/story-slice.js'),Sim=require('../src/simulation.js');

test('outer-quay drydock props share one physical collision world with CH01 rendering',()=>{
 const state=Story.createState();
 const hull=state.world.obstacles.find(o=>o.type==='story-drydock-hull');
 const locker=state.world.obstacles.find(o=>o.type==='story-rescue-locker');
 assert.deepEqual(hull,{x:-67,z:-106,w:8,d:3.2,h:2.2,type:'story-drydock-hull'});
 assert.deepEqual(locker,{x:-56,z:-106,w:1.8,d:1.2,h:1.8,type:'story-rescue-locker'});
 for(const prop of [hull,locker]){
  assert.equal(Sim.blocked(prop.x,prop.z,.85,state.world.obstacles),true);
  assert.equal(Sim.blocked(prop.x+prop.w/2+2,prop.z,.85,[prop]),false);
 }
 for(const marker of Object.values(Story.POINTS))
  assert.equal(Sim.blocked(marker.x,marker.z,.85,state.world.obstacles),false,
   'authored mission point remains physically accessible: '+marker.id);
});
test('drydock silhouettes are present in both renderer paths without checkpoint fields',()=>{
 const src=fs.readFileSync(path.resolve(__dirname,'../src/renderer.js'),'utf8');
 assert.match(src,/o\.type==='story-drydock-hull'/);
 assert.match(src,/o\.type==='story-rescue-locker'/);
 assert.match(src,/o\.w\*\.88,\.24,o\.d\*\.9/);
 const s=Story.createState(),raw=Story.serialize(s);
 const restored=Story.restore(raw);
 assert.equal(Story.serialize(restored),raw);
 assert.equal(restored.world.obstacles.filter(o=>o.type==='story-drydock-hull').length,1);
});
