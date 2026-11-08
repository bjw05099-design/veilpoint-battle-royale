'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const Sim=require('../src/simulation.js');
const Story=require('../src/story-slice.js');
const source=fs.readFileSync(path.join(__dirname,'../src/renderer.js'),'utf8');
function roofs(){
 const context={};vm.runInNewContext(source,context);
 return context.VeilpointSharedPublicCanopies;
}
test('three original public roofs use one source for WebGL and canvas BR/CH01 scene layers',()=>{
 const plan=roofs();
 assert.equal(plan.length,3);
 assert.deepEqual(plan.map(p=>[p.x,p.z]),[[28,147],[-107,128],[134,125]]);
 assert.ok(plan.every(p=>p.roofY>=3.2&&p.h>0&&p.h<.3));
 assert.ok(plan.every(p=>p.type==='shared-public-canopy'));
 assert.ok(Object.isFrozen(plan)&&plan.every(Object.isFrozen));
 assert.match(source,/for\(const roof of SHARED_PUBLIC_CANOPIES\)objects\.push\(roof\)/,
   'Canvas fallback must show every authored shared canopy');
 assert.match(source,/for\(const roof of SHARED_PUBLIC_CANOPIES\)\{/,
   'WebGL must generate the same public world asset array');
 assert.match(source,/if\(state\.terrainRevision===1\)/);
 assert.match(source,/if\(this\.worldTerrainRevision===1\)for\(const roof/);
});
test('shared roofs leave actual market and civilian transit doors traversable in BR and CH01 without new collision or save schema',()=>{
 const br=Sim.newMatch(20261108,0,'carbine');
 const story=Story.createState();
 assert.equal(br.terrainRevision,1);
 assert.equal(story.world.terrainRevision,1);
 const plan=roofs();
 for(const world of [br,story.world]){
  for(const roof of plan){
   assert.equal(Sim.blocked(roof.x,roof.z,.85,world.obstacles),false,
     'ground-level footpath beneath canopy must remain open');
   assert.equal(world.obstacles.some(o=>o.type==='shared-public-canopy'),false,
     'roof at 3+m height is not a phantom ground-level AABB');
  }
  for(const [x,z] of [[28,154],[28,140],[-107,140],[-107,116],[134,135],[134,115]]){
   assert.equal(Sim.blocked(x,z,.85,world.obstacles),false,
     'south and north civilian public entrances must remain physically walkable');
  }
 }
 const saved=Story.serialize(story);
 assert.equal(Story.serialize(Story.restore(saved)),saved,
  'new elevated render-only roofs must not alter old v2 checkpoints');
});
