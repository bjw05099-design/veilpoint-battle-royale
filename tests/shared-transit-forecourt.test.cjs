'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const Sim=require('../src/simulation.js'),Story=require('../src/story-slice.js');
const prefix='aden-transit-court-';
function solids(w){return w.obstacles.filter(o=>o.type.startsWith(prefix))
 .map(o=>({type:o.type,x:o.x,z:o.z,w:o.w,d:o.d,h:o.h}));}
test('shared transit forecourt is the same traversable physical geometry in BR and CH01',()=>{
 const br=Sim.newMatch(20261108,0,'carbine'),story=Story.createState();
 const original=solids(br);
 assert.equal(original.length,8);
 assert.deepEqual(solids(story.world),original);
 for(const world of [br,story.world]){
  for(const z of [105,112,124,138,145])assert.equal(
   Sim.blocked(134,z,.85,world.obstacles),false,
   'the authored public corridor remains genuinely walkable');
  assert.equal(Sim.blocked(118,125,.85,world.obstacles),true);
  assert.equal(Sim.blocked(150,125,.85,world.obstacles),true);
  const foot={x:134,z:104};
  for(let i=0;i<530;i++)Sim.moveEntity(foot,0,5,1/60,world.obstacles,.85);
  assert.ok(foot.z>146,'actual fixed-step actor traverses the courtyard without an invisible blocker');
 }
});
test('historical terrain and story saves are unchanged by new neighborhood geometry',()=>{
 const old=Sim.newMatch(20261108,0,'carbine',false,'central','day',0);
 assert.equal(solids(old).length,0);
 const fresh=Story.createState(),saved=Story.serialize(fresh),reloaded=Story.restore(saved);
 assert.deepEqual(solids(reloaded.world),solids(fresh.world));
 assert.equal(Story.serialize(reloaded),saved);
 const renderer=fs.readFileSync(path.resolve(__dirname,'../src/renderer.js'),'utf8');
 for(const type of ['aden-transit-court-wall','aden-transit-court-bench']){
  assert.match(renderer,new RegExp(type));
  assert.match(renderer,new RegExp("if\\(o\\.type==='"+type+"'\\)"),
   'visible WebGL material is required for every added collision shape');
 }
});
