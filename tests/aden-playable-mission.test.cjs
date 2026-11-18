'use strict';
const assert=require('node:assert/strict'),test=require('node:test');
const Tiles=require('../src/aden-citywide-tiles.js');
const Walk=require('../src/aden-city-walking-probe.js');
const Mission=require('../src/aden-walk-mission.js');
const source={provider:'Licensed fixture',acquiredDate:'2026-11-18',
 license:'Fixture license test',reference:'Test reference',type:'licensed-dem',scope:'public-terrain'};
function fixture(){
 return {version:1,revision:'a'.repeat(64),terrainAttribution:'test',vectorAttribution:'test',
  terrain:{format:'veilpoint-heightfield-v1',coordinateSystem:'local-metre-unreferenced',
   title:'Licensed fixture',tiles:[{tx:0,tz:0,gridSize:17,samples:Array(289).fill(10),source}]},
  roadsCm:[[[1000,1000],[17000,1000]]],
  footprintsCm:[[[10000,10000],[11000,11000],[10000,12000],[9000,11000]]]};
}
test('sourced footprint collision uses the rotated ring, not the box',()=>{
 const world=Mission.prepare(fixture()).world;
 assert.equal(Walk.probe(world,100,110),null,'polygon interior');
 assert.ok(Walk.probe(world,91,101),'free corner within AABB');
 assert.equal(Walk.probe(world,104.8,104.8),null,'body radius crosses the diagonal edge');
 assert.equal(Walk.probe(world,-.1,100),null,'terrain with no source stays unwalkable');
 const sideways=Walk.step(world,Walk.initial(world,110.5,110),{east:-1});
 assert.ok(sideways.x>110,'solid ring stops swept motion');
});
test('three physically reachable stops enforce the report and recover exact mission progress',()=>{
 const {verifyWalk}=require('../scripts/package-aden-playable.cjs');
 const runtime=Mission.prepare(fixture());
 assert.deepEqual(verifyWalk(runtime).events,['receipt','compare','handoff']);
 const raw=Mission.save(runtime,Mission.create(runtime,['receipt']));
 assert.deepEqual(Mission.load(runtime,raw).events,['receipt']);
 assert.throws(()=>Mission.load(runtime,raw.replace('receipt','handoff')),/history/);
 assert.throws(()=>Mission.load({...runtime,revision:'b'.repeat(64)},raw),/different map/);
});
test('fictional and out-of-extent source data fail before creating a playable scene',()=>{
 const bad=fixture();
 bad.terrain.tiles[0].source={...source,type:'artist-blockout'};
 assert.throws(()=>Mission.prepare(bad),/sourced/);
 const far=fixture();
 far.footprintsCm[0][0]=[900000,0];
 assert.throws(()=>Mission.prepare(far),/extent/);
});
