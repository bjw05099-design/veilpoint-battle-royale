'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const Story=require('../src/story-slice.js');
const Sim=require('../src/simulation.js');
const Footpaths=require('../src/public-city-footpaths.js');

test('shared civilian footpath search respects a strict per-step budget and cannot cross walls',()=>{
 const wall=[{x:6,z:0,w:2,d:8,type:'civilian-wall'}],
  from={x:0,z:0},goal={x:13,z:0};
 assert.equal(Footpaths.plan(from,goal,wall,{maxVisits:1}),null);
 assert.throws(()=>Footpaths.plan(from,goal,wall,{maxVisits:11001}),/budget/);
 assert.throws(()=>Footpaths.plan(from,goal,wall,{maxVisits:0}),/budget/);
 const route=Footpaths.plan(from,goal,wall,{maxVisits:420});
 assert.ok(route&&route.length>=3,'pedestrian must detour around an actual wall');
 assert.equal(route[0].x,from.x);assert.equal(route.at(-1).x,goal.x);
 const inflated=wall.map(o=>({...o,w:o.w+2*Footpaths.CLEARANCE,d:o.d+2*Footpaths.CLEARANCE}));
 for(let i=1;i<route.length;i++){
  assert.equal(Sim.lineBlocked(route[i-1].x,route[i-1].z,route[i].x,route[i].z,inflated),false,
   'even a corner-to-corner segment must preserve the actual pedestrian width');
 }
});
test('Kim walks around a newly blocked civilian sidewalk using physical 60Hz steps without teleporting',()=>{
 const state=Story.createState(),obstacles=state.world.obstacles;
 // An isolated local test sidewalk, selected from real loaded CH01 map data,
 // means the path is proved against the SAME world obstacles as the game.
 let anchor=null;
 for(let x=-130;x<=100&&!anchor;x+=20)for(let z=-130;z<=100&&!anchor;z+=20){
  const offsetsX=[-3,0,6,14,18],offsetsZ=[-8,-5,0,5,8];
  if(offsetsX.every(dx=>offsetsZ.every(dz=>!Sim.blocked(x+dx,z+dz,1.05,obstacles))))
   anchor={x,z};
 }
 assert.ok(anchor,'story map must contain a civilian sidewalk sized for the playable detour');
 const wall={x:anchor.x+6,z:anchor.z,w:2,d:8,h:3,type:'civilian-closure-test'},
  s=state;
 s.world.obstacles.push(wall);
 s.phase='records';s.combat.cleared=true;
 for(const b of s.world.bots){b.health=0;b.alive=false;}
 s.kimJiyoon.x=anchor.x;s.kimJiyoon.z=anchor.z;
 s.world.kimJiyoon.x=anchor.x;s.world.kimJiyoon.z=anchor.z;
 s.world.player.x=anchor.x+14;s.world.player.z=anchor.z;
 s.world.player.yaw=0;
 const initial={...s.kimJiyoon},maxStep=5/60+.0002;
 for(let i=0;i<900;i++){
  const oldX=s.kimJiyoon.x,oldZ=s.kimJiyoon.z;
  Story.step(s,1/60,{});
  assert.ok(Math.hypot(s.kimJiyoon.x-oldX,s.kimJiyoon.z-oldZ)<=maxStep,
   'companion cannot skip wall physics or teleport between 60Hz updates');
  assert.equal(Sim.blocked(s.kimJiyoon.x,s.kimJiyoon.z,.55,s.world.obstacles),false);
  assert.equal(s.world.kimJiyoon.x,s.kimJiyoon.x,'visible actor and simulation position must agree');
  assert.equal(s.world.kimJiyoon.z,s.kimJiyoon.z);
  if(s.kimJiyoon.x>wall.x+wall.w/2+1.3)break;
 }
 assert.ok(s.kimJiyoon.x>wall.x+wall.w/2+1.3,
  'companion should genuinely find the clear sidewalk around an ordinary public wall');
 assert.ok(Math.abs(s.kimJiyoon.z-initial.z)>1,
  'a wall detour must use the side pavement instead of crossing a solid facade');
});
test('the standalone story-first navigation uses the public module already shipped before CH01 and does not change save shape',()=>{
 const html=fs.readFileSync(path.resolve(__dirname,'../story.html'),'utf8');
 const source=fs.readFileSync(path.resolve(__dirname,'../src/story-slice.js'),'utf8');
 assert.ok(html.indexOf('src/public-city-footpaths.js')>0);
 assert.ok(html.indexOf('src/public-city-footpaths.js')<html.indexOf('src/story-slice.js'));
 assert.match(source,/maxVisits:420/);
 assert.match(source,/Footpaths\.plan\(w,goal,solids/);
 const start=Story.createState(),saved=Story.serialize(start);
 assert.equal(Story.serialize(Story.restore(saved)),saved,'story v2 and future BR saves remain isolated');
});
