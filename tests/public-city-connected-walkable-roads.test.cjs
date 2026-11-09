'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const Sim=require('../src/simulation.js'),Story=require('../src/story-slice.js');
const Footpaths=require('../src/public-city-footpaths.js');
function walkEachSegment(points,obstacles){
 for(let i=1;i<points.length;i++){
  const a=points[i-1],b=points[i],length=Math.hypot(b.x-a.x,b.z-a.z);
  assert.ok(length>0);
  for(let n=0;n<=Math.ceil(length/.4);n++){
   const t=n/Math.ceil(length/.4);
   const x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t;
   assert.equal(Sim.blocked(x,z,.85,obstacles),false,
     'a real human must traverse the full physical corridor '+i+' at '+t);
  }
 }
}
test('new public street planner bends around actual walls, never paints through a solid',()=>{
 const wall=[{x:5,z:0,w:3,d:12}];
 const road=Footpaths.plan({x:0,z:0},{x:11,z:0},wall);
 assert.ok(road&&road.length>2,'straight paint would cross the civic wall');
 assert.deepEqual(road[0],{x:0,z:0});
 assert.deepEqual(road.at(-1),{x:11,z:0});
 walkEachSegment(road,wall);
 assert.equal(Footpaths.plan({x:5,z:0},{x:11,z:0},wall),null);
 assert.equal(Footpaths.plan({x:NaN,z:0},{x:11,z:0},wall),null);
});
test('all three public district links are physically walkable and shared by offline BR and CH01',()=>{
 const br=Sim.newMatch(19770,0),story=Story.createState();
 for(const world of [br,story.world]){
  const roads=Footpaths.planAll(world.obstacles);
  assert.deepEqual(roads.map(x=>[x.from,x.to]),Sim.PUBLIC_CITY_ADJACENCY.map(x=>[x.from,x.to]));
  for(const road of roads){
   assert.ok(road.walkable,'public district must be connected via existing open space '+road.from+' to '+road.to);
   assert.ok(road.points.length>=2);
   walkEachSegment(road.points,world.obstacles);
   assert.ok(Object.isFrozen(road.points)&&Object.isFrozen(road.points[0]));
  }
 }
 const old=Sim.newMatch(19770,0,'carbine',false,'central','day',0);
 assert.equal(old.terrainRevision,0);
 assert.ok(old.obstacles.every(x=>!x.type?.includes('public-footpath')));
 const checkpoint=Story.serialize(story);
 Footpaths.planAll(story.world.obstacles);
 assert.equal(Story.serialize(story),checkpoint,
  'pedestrian street model must never mutate active 60Hz state');
 assert.equal(Story.serialize(Story.restore(checkpoint)),checkpoint);
});
test('visible road follows fixed-step passable geometry across both renderer backends',()=>{
 const render=fs.readFileSync(path.resolve(__dirname,'../src/renderer.js'),'utf8');
 assert.match(render,/PublicFootpaths\.planAll\(state\.obstacles\)/);
 assert.match(render,/PublicFootpaths\.planAll\(sim\.obstacles\)/);
 assert.match(render,/m\.quad\(\[ax-sx,height/);
 assert.match(render,/polygon\(\[proj\(a\.x-px/);
 assert.match(render,/this\.worldTerrainRevision===1&&PublicFootpaths/);
 for(const html of ['index.html','story.html']){
  const source=fs.readFileSync(path.resolve(__dirname,'..',html),'utf8');
  assert.ok(source.indexOf('src/public-city-footpaths.js')>
   source.indexOf('src/simulation.js'));
  assert.ok(source.indexOf('src/public-city-footpaths.js')<
   source.indexOf('src/renderer.js'));
 }
 const source=fs.readFileSync(path.resolve(__dirname,'../src/public-city-footpaths.js'),'utf8');
 assert.doesNotMatch(source,/fetch\(|XMLHttpRequest|navigator\.geolocation|WebSocket|localStorage/,
  'authored street geometry is offline and has no current security or GPS fetch');
});
