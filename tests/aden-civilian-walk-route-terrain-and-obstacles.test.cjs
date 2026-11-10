'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Tiles=require('../src/aden-citywide-tiles.js');
const Explorer=require('../src/aden-city-explorer.js');
const Walk=require('../src/aden-city-walking-probe.js');
const Districts=require('../src/aden-preview-districts.js');
const Route=require('../src/aden-civilian-walk-route.js');
const Story=require('../src/story-slice.js');
function fixture(){
 const registry=Explorer.createPreviewRegistry(),cache=new Map();
 const context={fillRect(){},strokeRect(){},beginPath(){},
  moveTo(){},lineTo(){},closePath(){},fill(){},stroke(){}};
 Explorer.draw({width:1280,height:720,getContext:()=>context},registry,
  Explorer.viewState(),cache);
 const buildings=[...Explorer.CIVIC_SHELLS,...Districts.PLAN.buildings];
 const world=(closed=new Set())=>Walk.createWorld(registry,cache,
  new Set(cache.keys()),buildings,closed);
 return {registry,cache,world};
}
test('all eight original public quarters have physically safe read-only routes into their real open door',()=>{
 const {world}=fixture(),scene=world();
 assert.equal(Districts.PUBLIC_INTERIORS.length,8);
 assert.equal(Route.autoMove,false);
 assert.equal(Route.geographyVerified,false);
 let count=0;
 for(const room of Districts.PUBLIC_INTERIORS){
  const person=Walk.initial(scene,room.x,room.z+room.d/2+2);
  const before=JSON.stringify(person);
  const planned=Route.plan(scene,person);
  assert.equal(planned.status,'planned',room.id);
  assert.equal(planned.roomId,room.id);
  assert.ok(planned.distanceMetres>=3.2&&planned.distanceMetres<=5);
  assert.ok(planned.explored<=Route.MAX_EXPANSIONS);
  assert.ok(Object.isFrozen(planned)&&Object.isFrozen(planned.points));
  assert.ok(planned.points.every(p=>Object.isFrozen(p)));
  const end=planned.points.at(-1);
  assert.ok(Districts.publicRoomAt(end.x,end.z)?.id===room.id);
  for(let i=1;i<planned.points.length;i++){
   const a=planned.points[i-1],b=planned.points[i];
   assert.equal(Route.segment(scene,a,b),true,'every drawn straight route section must have real capsule clearance');
   assert.ok(Math.abs(Walk.probe(scene,b.x,b.z).y-b.y)<1e-7);
  }
  assert.equal(JSON.stringify(person),before,'route preview cannot advance the fixed-step character');
  assert.equal(planned.controlsPlayer,false);
  assert.equal(planned.surveyedGeography,false);
  count++;
 }
 assert.equal(count,8);
 const save=Story.serialize(Story.createState());
 Route.plan(scene,Walk.initial(scene,0,0));
 assert.equal(Story.serialize(Story.restore(save)),save);
});
test('a longer path detours around occupied home plots, not through the nearest projected wall',()=>{
 const {world}=fixture(),scene=world(),room=Districts.PUBLIC_INTERIORS[0];
 const start=Walk.initial(scene,room.x+12,room.z+2);
 const planned=Route.plan(scene,start);
 assert.equal(planned.status,'planned');
 assert.ok(planned.points.length>=4,'civilian route needs real bends around residential facade');
 assert.ok(planned.distanceMetres>Math.hypot(start.x-room.x,
  start.z-(room.z+room.d/2-1.6))+1,'real detour must exceed through-wall distance');
 for(let i=1;i<planned.points.length;i++)
  assert.equal(Route.segment(scene,planned.points[i-1],planned.points[i]),true);
});
test('closed public doors reject indoor path while old open world remains a valid unmodified snapshot',()=>{
 const {world}=fixture(),room=Districts.PUBLIC_INTERIORS[0],open=world(),
  closed=world(new Set([room.id]));
 const player=Walk.initial(open,room.x,room.z+room.d/2+2);
 assert.equal(Route.plan(open,player).status,'planned');
 const oldSolids=open.solids.length;
 const denied=Route.plan(closed,Walk.initial(closed,player.x,player.z));
 assert.equal(denied.status,'door-closed');
 assert.equal(denied.points.length,0);
 assert.equal(open.solids.length,oldSolids);
 assert.equal(Route.plan(open,player).status,'planned');
 assert.equal(Route.plan(open,Walk.initial(open,0,0)).status,'no-nearby-public-room');
});
test('unloaded or stale terrain yields no fake route and the planner fails closed for invalid requests',()=>{
 const {world,registry,cache}=fixture();
 const onlyOne=new Set([Tiles.tileFor(0,0).key]);
 const missing=Walk.createWorld(registry,cache,onlyOne,
  [...Explorer.CIVIC_SHELLS,...Districts.PLAN.buildings]);
 const start=Walk.initial(missing,0,0);
 assert.equal(Route.plan(missing,start).status,'no-nearby-public-room');
 const real=world(),room=Districts.PUBLIC_INTERIORS[0];
 const solid=Districts.PLAN.buildings.find(b=>!b.publicInterior);
 assert.equal(Route.plan(real,{x:solid.x,z:solid.z}).status,'invalid-start',
  'an occupied solid or unverifiable starting point cannot authorize a route');
 assert.throws(()=>Route.plan(real,{x:Infinity,z:0}),/Invalid fictional civilian route/);
 assert.throws(()=>Route.plan(real,null),/Invalid fictional civilian route/);
 assert.throws(()=>Route.plan(real,Walk.initial(real,0,0),{}),
  /Invalid fictional civilian route/);
});
