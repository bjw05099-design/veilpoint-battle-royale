'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Explorer=require('../src/aden-city-explorer.js');
const Walk=require('../src/aden-city-walking-probe.js');
const Districts=require('../src/aden-preview-districts.js');
function scene(){
 const registry=Explorer.createPreviewRegistry(),cache=new Map();
 const ctx={fillRect(){},strokeRect(){},beginPath(){},moveTo(){},lineTo(){},closePath(){},fill(){},stroke(){}};
 Explorer.draw({width:1280,height:720,getContext:()=>ctx},
  registry,Explorer.viewState(),cache);
 const world=()=>Walk.createWorld(registry,cache,new Set(cache.keys()),
  [...Explorer.CIVIC_SHELLS,...Districts.PLAN.buildings],new Set());
 return {registry,cache,world};
}
test('two living civilian bodies may not enter the same standing capsule at the same 60Hz tick',()=>{
 const radius=Walk.RADIUS_METRES;
 assert.equal(Explorer.civicPoseClear({x:0,z:0},[{x:radius,z:0}]),false);
 assert.equal(Explorer.civicPoseClear({x:0,z:0},[{x:2*radius+.2,z:0}]),true);
 const stable={version:1,tick:4,x:0,z:0,y:1,blocked:false};
 assert.equal(Explorer.civicPoseClear(stable,[{x:0,z:0}]),false);
 assert.equal(Explorer.civicPoseClear(stable,[{x:Infinity,z:0}]),true);
 const source=require('node:fs').readFileSync(require('node:path').resolve(__dirname,'../src/aden-city-explorer.js'),'utf8');
 assert.match(source,/civicPoseClear\(proposedCivilian,people\)/);
 assert.match(source,/occupied\?Walk\.step\(world,actor\.pose,\{east:0\}\):proposedCivilian/);
});
test('closing a public doorway must reject any REAL human now occupying the future door solidity',()=>{
 const room=Districts.PUBLIC_INTERIORS[0],sceneData=scene();
 const w=sceneData.world();
 const x=room.x,z=room.z+room.d/2;
 const visitor={x,z:z+1.4};
 assert.equal(Explorer.publicDoorClear(w,[visitor]),true);
 const closed=Walk.createWorld(sceneData.registry,sceneData.cache,new Set(sceneData.cache.keys()),
  [...Explorer.CIVIC_SHELLS,...Districts.PLAN.buildings],new Set([room.id]));
 const threshold={x,z:z+.15};
 assert.equal(Explorer.publicDoorClear(w,[threshold]),true);
 assert.equal(Explorer.publicDoorClear(closed,[threshold]),false);
 assert.equal(Explorer.publicDoorClear(closed,[visitor]),true);
 const src=require('node:fs').readFileSync(require('node:path').resolve(__dirname,'../src/aden-city-explorer.js'),'utf8');
 assert.match(src,/publicDoorClear\(candidate,\[walk,\.\.\.civicWalkers\.map\(a=>a\.pose\)\]\)/);
});
