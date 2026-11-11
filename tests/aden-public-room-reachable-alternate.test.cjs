'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');

// Exercise the shipped route planner through the same browser global factory
// while controlling only the probe: its real terrain/collision integration has
// independent end-to-end tests in this suite.
function routeWithLevelPublicGround(){
 const context={VeilpointAdenWalkingProbe:{
  MAX_TICK_STEP_METRES:.35,
  probe(_world,x,z){return Number.isFinite(x)&&Number.isFinite(z)?{y:0}:null;}
 }};
 vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,
  '../src/aden-civilian-walk-route.js'),'utf8'),context);
 return context.VeilpointCivilianWalkRoute;
}
const room=(id,x)=>({id,x,z:0,d:4});
const world=(rooms,closed=[])=>({rooms,solids:closed.map(id=>({id:id+':door'}))});
const pedestrian=Object.freeze({x:0,z:0,tick:25});

test('nearest closed public entrance yields to a second physically available entrance',()=>{
 const Route=routeWithLevelPublicGround();
 const scene=world([room('nearest',2),room('open',7)],['nearest']);
 const before=JSON.stringify(scene),result=Route.plan(scene,pedestrian);
 assert.equal(result.status,'planned');
 assert.equal(result.roomId,'open');
 assert.equal(result.originTick,25);
 assert.equal(result.points.at(-1).x,7);
 assert.ok(result.points.length>=2);
 assert.ok(Object.isFrozen(result)&&Object.isFrozen(result.points));
 for(let i=1;i<result.points.length;i++)
  assert.equal(Route.segment(scene,result.points[i-1],result.points[i]),true);
 assert.equal(JSON.stringify(scene),before,'route is read-only and never opens a closed door');
 assert.equal(Route.autoMove,false);
});
test('a bounded search does not invent a fourth reachable entrance outside the candidate budget',()=>{
 const Route=routeWithLevelPublicGround();
 const scene=world([room('a',2),room('b',4),room('c',6),room('d',8)],
  ['a','b','c']);
 const result=Route.plan(scene,pedestrian);
 assert.equal(result.status,'door-closed');
 assert.equal(result.roomId,'a');
 assert.equal(result.points.length,0);
 assert.equal(Route.plan(world([room('a',2)],['a']),pedestrian).status,'door-closed');
});
