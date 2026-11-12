'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Tiles=require('../src/aden-citywide-tiles.js');
const Eye=require('../src/aden-street-perspective.js');
const SOURCE=Object.freeze({provider:'VEILPOINT original fictional terrain',observedDate:'2026-11-12',
 license:'Original author-owned fictional data',reference:'local-only test elevation grid',
 scope:'public-terrain',type:'artist-blockout'});
function tile(tx,tz,fn=()=>12){
 return Tiles.createHeightTile({tx,tz,gridSize:17,
  samples:Array.from({length:17*17},(_,i)=>fn(i%17,Math.floor(i/17))),
  source:SOURCE});
}
function scene(...tiles){
 const registry=Tiles.createRegistry(tiles),meshes=new Map(),cache=new Map();
 for(const sourceTile of tiles){
  const mesh=Tiles.buildTerrainMesh(sourceTile);
  meshes.set(sourceTile.key,mesh);cache.set(sourceTile.key,{sourceTile,mesh});
 }
 return {registry,meshes,cache};
}
function canvas(){
 const ctx={fillStyle:'',fillRect(){},beginPath(){},moveTo(){},lineTo(){},
  closePath(){},fill(){}};
 return {width:1280,height:720,getContext:()=>ctx};
}
test('eye-level civilian house requires entire streamed 9-point physical foundation',()=>{
 const building={x:511,z:210,w:8,d:12,h:7,color:'#abc'};
 const only=scene(tile(0,0));
 assert.equal(Eye.groundedFacade(building,only.registry,only.meshes,Tiles),null,
  'loaded centre cannot fake an unloaded eastern half of the building');
 assert.equal(Eye.draw(canvas(),only.registry,only.cache,{x:505,y:12,z:218},0,[building]).civilianFacades,0);
 const complete=scene(tile(0,0),tile(1,0));
 assert.deepEqual(Eye.groundedFacade(building,complete.registry,complete.meshes,Tiles),
  {baseMetres:12,lowMetres:12,plinthMetres:0,actualSurveyVerified:false});
 assert.equal(Eye.draw(canvas(),complete.registry,complete.cache,
  {x:505,y:12,z:218},0,[building]).civilianFacades,1);
 assert.equal(Eye.groundedFacade(building,complete.registry,new Map([[Tiles.tileKey(0,0),complete.meshes.get(Tiles.tileKey(0,0))]]),Tiles),null);
});
test('sloped fictional 3D facades have a physical plinth but reject cliffs and sea',()=>{
 const b={x:220,z:210,w:20,d:12,h:10};
 const sloped=scene(tile(0,0,col=>12+col*2));
 const foundation=Eye.groundedFacade(b,sloped.registry,sloped.meshes,Tiles);
 assert.ok(foundation);
 assert.ok(foundation.plinthMetres>0&&foundation.plinthMetres<6);
 assert.equal(Eye.draw(canvas(),sloped.registry,sloped.cache,{x:210,y:14,z:220},0,[b]).civilianFacades,1);
 const cliff=scene(tile(0,0,col=>12+col*30));
 assert.equal(Eye.groundedFacade(b,cliff.registry,cliff.meshes,Tiles),null);
 assert.equal(Eye.draw(canvas(),cliff.registry,cliff.cache,{x:210,y:25,z:220},0,[b]).civilianFacades,0);
 const sea=scene(tile(0,0,()=>-5));
 assert.equal(Eye.groundedFacade(b,sea.registry,sea.meshes,Tiles),null);
 assert.equal(Eye.draw(canvas(),sea.registry,sea.cache,{x:210,y:2,z:220},0,[b]).civilianFacades,0);
});
