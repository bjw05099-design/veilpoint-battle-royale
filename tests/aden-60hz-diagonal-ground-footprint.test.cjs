'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');

// Load the shipped browser collision engine, replacing ONLY the procedural
// fictional terrain source to isolate a diagonal 35-degree ground hazard.
function diagonalTerrainFixture(){
 const tile={key:'aden:0:0'},mesh={};
 const context={
  VeilpointAdenCityTiles:{
   tileFor(){return {key:tile.key};},
   terrainSurface(_mesh,x,z){
    const steep=x>.3&&z>.3;
    return {elevationMetres:steep?1:0,slopeDegrees:steep?51:0,
     normal:{x:0,y:1,z:0}};
   }
  },
  VeilpointAdenPreviewDistricts:{PUBLIC_INTERIORS:[],
   buildingFoundation(){return null;}}
 };
 vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,
  '../src/aden-city-walking-probe.js'),'utf8'),context);
 const world={solids:[],registry:new Map([[tile.key,tile]]),
  cache:new Map([[tile.key,{sourceTile:tile,mesh}]]),
  activeKeys:new Set([tile.key])};
 return {Walk:context.VeilpointAdenWalkingProbe,world};
}
test('the original 60Hz body probe rejects steep ground under a diagonal foot edge',()=>{
 const {Walk,world}=diagonalTerrainFixture();
 assert.ok(Walk.probe(world,-.05,-.05));
 assert.equal(Walk.probe(world,0,0),null,
  'cardinal contacts are level; the diagonal body perimeter reaches an unsafe triangle');
 assert.throws(()=>Walk.initial(world,0,0),/No walkable/);
});
test('fixed-step civilian movement cannot diagonally clip through a steep terrain corner',()=>{
 const {Walk,world}=diagonalTerrainFixture();
 let state=Walk.initial(world,-.05,-.05);
 for(let i=0;i<30;i++)state=Walk.step(world,state,{east:1,south:1});
 assert.equal(state.tick,30);
 assert.ok(!(state.x>.02&&state.z>.02),
  '60Hz terrain movement must slide around, not pass across an unsafe corner');
 assert.equal(state.version,1,'V1 local walking state remains compatible');
 assert.equal(world.surveyedAden,undefined,'synthetic test terrain is not an actual survey');
});
