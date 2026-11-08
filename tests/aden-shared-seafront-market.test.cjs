'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const Sim=require('../src/simulation.js'),Story=require('../src/story-slice.js');
const fixtures=[
 {x:16,z:147,w:.6,d:18,h:3.5,type:'aden-seafront-market-wall'},
 {x:40,z:147,w:.6,d:18,h:3.5,type:'aden-seafront-market-wall'},
 {x:20,z:156,w:8,d:.6,h:3.5,type:'aden-seafront-market-wall'},
 {x:36,z:156,w:8,d:.6,h:3.5,type:'aden-seafront-market-wall'},
 {x:20,z:146,w:1.8,d:3,h:1.1,type:'aden-seafront-market-counter'},
 {x:36,z:146,w:1.8,d:3,h:1.1,type:'aden-seafront-market-counter'}
];
const market=world=>world.obstacles.filter(o=>o.type?.startsWith('aden-seafront-market-'));
test('shared fictional seaside market has one exact BR/CH01 collider source and two walkable street-level entrances',()=>{
 const br=Sim.newMatch(20261108,0),ch=Story.createState();
 assert.deepEqual(market(br),fixtures);
 assert.deepEqual(market(ch.world),fixtures);
 for(const body of fixtures){
  assert.equal(Sim.blocked(body.x,body.z,.85,br.obstacles),true);
  assert.equal(Sim.blocked(body.x,body.z,.85,ch.world.obstacles),true);
 }
 for(const world of [br,ch.world]){
  const walker={x:28,z:132};
  for(let tick=0;tick<600;tick++)Sim.moveEntity(walker,0,4.2,1/60,world.obstacles,.85);
  assert.ok(walker.z>156.8,'must cross the northern open passage on foot');
  assert.ok(walker.z<174.3,'cannot walk beyond the shared map boundary');
  assert.equal(walker.x,28);
  assert.equal(Sim.blocked(walker.x,walker.z,.85,world.obstacles),false);
  for(let tick=0;tick<600;tick++)Sim.moveEntity(walker,0,-4.2,1/60,world.obstacles,.85);
  assert.ok(walker.z<137,'the south approach remains traversable in both modes');
 }
});
test('pre-authoring terrain preserves original footprints, exact save round-trip and supplies',()=>{
 const prior=Sim.newMatch(42,4,'carbine',false,'central','day',0);
 assert.deepEqual(market(prior),[]);
 prior.status='playing';
 assert.deepEqual(market(Sim.restoreMatch(Sim.snapshotMatch(prior))),[]);
 const current=Sim.newMatch(42,4,'carbine',false,'central','day',1);
 assert.equal(current.loot.length,40);
 current.status='playing';
 assert.deepEqual(market(Sim.restoreMatch(Sim.snapshotMatch(current))),fixtures);
 assert.deepEqual(market(Story.restore(Story.serialize(Story.createState())).world),fixtures);
});
test('market colliders have visible software and WebGL art without phantom door walls',()=>{
 const render=fs.readFileSync(path.resolve(__dirname,'../src/renderer.js'),'utf8');
 assert.match(render,/o\.type\.startsWith\('aden-seafront-market-'\)\?o\.type/);
 assert.match(render,/o\.type==='aden-seafront-market-wall'/);
 assert.match(render,/o\.type==='aden-seafront-market-counter'/);
 assert.match(render,/m\.box\(o\.x,0,o\.z,o\.w,o\.h,o\.d,\[\.64,\.54,\.43\]\)/);
 assert.match(render,/m\.box\(o\.x,0,o\.z,o\.w,o\.h,o\.d,\[\.55,\.41,\.28\]\)/);
});
