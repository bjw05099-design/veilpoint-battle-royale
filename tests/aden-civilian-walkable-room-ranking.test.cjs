'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');

// Load the actual browser/Node route module with a deterministic fictional
// collision probe. Existing terrain/LOD tests independently cover real meshes.
const source=fs.readFileSync(path.join(__dirname,'../src/aden-civilian-walk-route.js'),'utf8');
const wall=Object.freeze({minX:1.5,maxX:3.5,minZ:-7.5,maxZ:7.5});
const Probe={
 MAX_TICK_STEP_METRES:1,
 probe(_world,x,z){
  if(!Number.isFinite(x)||!Number.isFinite(z)||Math.abs(x)>50||Math.abs(z)>50)return null;
  if(x>=wall.minX&&x<=wall.maxX&&z>=wall.minZ&&z<=wall.maxZ)return null;
  return {y:0};
 }
};
const context={VeilpointAdenWalkingProbe:Probe};
vm.runInNewContext(source,context,{filename:'aden-civilian-walk-route.js'});
const Route=context.VeilpointCivilianWalkRoute;
const world={solids:[wall]};
const rooms=[
 {id:'near-across-wall',x:5,z:0,d:4},
 {id:'far-clear-walk',x:-8,z:0,d:4}
];
test('civilian preview ranks verified walking distance rather than nearest through-wall doorway',()=>{
 const walker={x:0,z:0,tick:165},before=JSON.stringify(walker);
 const result=Route.plan(world,walker,rooms);
 assert.equal(result.status,'planned');
 assert.equal(result.roomId,'far-clear-walk');
 assert.ok(result.distanceMetres>=8&&result.distanceMetres<9);
 assert.equal(result.originTick,165);
 assert.equal(result.controlsPlayer,false);
 assert.equal(result.surveyedGeography,false);
 assert.equal(Object.isFrozen(result.points),true);
 for(let i=1;i<result.points.length;i++)
  assert.equal(Route.segment(world,result.points[i-1],result.points[i]),true);
 assert.equal(JSON.stringify(walker),before);
 const onlyNear=Route.plan(world,walker,[rooms[0]]);
 assert.equal(onlyNear.status,'planned','the nearer room has a real but much longer detour');
 assert.ok(onlyNear.distanceMetres>result.distanceMetres+3);
});
test('room-id tie break stays deterministic when two verified public doors share the same position',()=>{
 const walker={x:0,z:0,tick:16};
 const same=[{id:'z-room',x:-6,z:0,d:4},{id:'a-room',x:-6,z:0,d:4}];
 const result=Route.plan(world,walker,same);
 assert.equal(result.status,'planned');
 assert.equal(result.roomId,'a-room');
 assert.equal(Route.autoMove,false);
});
