'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const Sim=require('../src/simulation.js');
const Story=require('../src/story-slice.js');
const places=Sim.PUBLIC_CITY_DISTRICTS;

test('public Aden district references have honest coastal/peninsula relative arrangement',()=>{
 assert.deepEqual(places.map(p=>p.id),['tawahi','mualla','crater','khormaksar']);
 const by=Object.fromEntries(places.map(p=>[p.id,p]));
 assert.ok(by.tawahi.x<by.mualla.x && by.mualla.x<by.crater.x);
 assert.ok(by.crater.x<by.khormaksar.x);
 assert.ok(by.mualla.z<by.crater.z,'northern coast precedes southern volcanic district');
 assert.ok(by.khormaksar.z<by.crater.z,'isthmus lies north of historic basin');
 assert.deepEqual(Sim.PUBLIC_CITY_ADJACENCY.map(edge=>[edge.from,edge.to]),[
  ['tawahi','mualla'],['mualla','crater'],['crater','khormaksar']
 ]);
 for(const p of places){
  assert.equal(Object.isFrozen(p),true);
  assert.ok(!('lat' in p)&&!('longitude' in p)&&!('checkpoint' in p),
   'fictional gameplay positions are never invented real GPS or a security installation');
 }
});
test('public district anchors are actual walkable civil places shared by offline BR and story',()=>{
 const br=Sim.newMatch(1977,0),ch=Story.createState();
 for(const p of places){
  for(const world of [br,ch.world]){
   const match=world.obstacles.filter(o=>o.type===p.physicalType &&
    Math.hypot(o.x-p.x,o.z-p.z)<=22);
   assert.ok(match.length>0,'district must be mapped to real physical civic architecture: '+p.id);
   assert.equal(Sim.blocked(p.x,p.z,.85,world.obstacles),false,
    'existing pedestrian position must remain walkable: '+p.id);
   const observation=Sim.publicDistrictAt({x:p.x,z:p.z},world.obstacles);
   assert.equal(observation?.id,p.id,'nearby public city reference should be visible: '+p.id);
  }
 }
 assert.deepEqual(
  br.obstacles.filter(o=>o.type.startsWith('aden-')),
  ch.world.obstacles.filter(o=>o.type.startsWith('aden-')),
  'BR and CH01 must use identical physical public city bodies'
 );
});
test('city context cannot reveal remote or nonexistent areas, nor change a historical revision-0 save',()=>{
 const br=Sim.newMatch(1980,0);
 assert.equal(Sim.publicDistrictAt({x:0,z:0},br.obstacles),null);
 assert.equal(Sim.publicDistrictAt(null,br.obstacles),null);
 assert.equal(Sim.publicDistrictAt({x:NaN,z:10},br.obstacles),null);
 assert.equal(Sim.publicDistrictAt({x:places[0].x,z:places[0].z},[]),null);
 const old=Sim.newMatch(1981,0,'carbine',false,'central','day',0);
 for(const place of places)
  assert.equal(Sim.publicDistrictAt(place,old.obstacles),null,
   'old saved terrain cannot imply a newly placed building');
 const story=Story.createState(),before=Story.serialize(story);
 for(const place of places)Sim.publicDistrictAt(place,story.world.obstacles);
 assert.equal(Story.serialize(story),before,'public reference is read-only, no mission or save flags');
 const restored=Story.restore(before);
 assert.equal(Story.serialize(restored),before);
});
test('both real PC navigation panels receive context only from their shared physical world',()=>{
 const br=fs.readFileSync(path.resolve(__dirname,'../src/app.js'),'utf8');
 const story=fs.readFileSync(path.resolve(__dirname,'../src/story-app.js'),'utf8');
 assert.match(br,/Game\.publicDistrictAt\(p,s\.obstacles\)/);
 assert.match(story,/Sim\.publicDistrictAt\(state\.world\.player,state\.world\.obstacles\)/);
 assert.match(br,/도시 구조:/);
 assert.match(story,/도시 구조:/);
});
