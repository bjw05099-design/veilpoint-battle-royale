'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Tiles=require('../src/aden-citywide-tiles.js');
const Explorer=require('../src/aden-city-explorer.js');
const registry=Explorer.createPreviewRegistry(3);
function canvas() {
 const ctx={fillStyle:'',strokeStyle:'',lineWidth:1,
  fillRect(){},beginPath(){},moveTo(){},lineTo(){},closePath(){},
  fill(){},stroke(){},strokeRect(){}};
 return {width:1280,height:720,getContext:()=>ctx};
}
test('first-person preview retains center and adjacent 3x3 terrain while streaming farther source tiles ahead',()=>{
 const ahead=Tiles.planStreaming(0,0,registry,[],{
  radius:3,maxLoaded:25,lookAhead:{x:2,z:0}});
 const behind=Tiles.planStreaming(0,0,registry,[],{
  radius:3,maxLoaded:25,lookAhead:{x:-2,z:0}});
 for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){
  const key=Tiles.tileKey(dx,dz);
  assert.ok(ahead.active.includes(key),'nearby collision terrain '+key);
  assert.ok(behind.active.includes(key),'nearby collision terrain '+key);
 }
 assert.equal(ahead.active.length,25);
 assert.equal(ahead.active.includes('aden:3:0'),true);
 assert.equal(ahead.active.includes('aden:-3:0'),false);
 assert.equal(behind.active.includes('aden:-3:0'),true);
 assert.equal(behind.active.includes('aden:3:0'),false);
 assert.equal(ahead.unresolved.length,0);
 assert.equal(ahead.deferred.length,24);
 assert.deepEqual(ahead,Tiles.planStreaming(0,0,registry,[],{
  radius:3,maxLoaded:25,lookAhead:{x:1,z:0}}));
});
test('terrain viewer uses actual directional streaming without increasing its 25-mesh budget',()=>{
 const cache=new Map(),view=Explorer.viewState();
 const ordinary=Explorer.draw(canvas(),registry,view,cache);
 assert.equal(ordinary.active,25);
 assert.equal(cache.has('aden:3:0'),false);
 const street=Explorer.draw(canvas(),registry,view,cache,{lookAhead:{x:1,z:0}});
 assert.equal(street.active,25);
 assert.equal(cache.size,25);
 assert.equal(cache.has('aden:3:0'),true);
 assert.equal(cache.has('aden:-3:0'),false);
 assert.equal(cache.has('aden:0:0'),true);
 assert.equal(street.realAdenTilesLoaded,0);
 const turn=Explorer.draw(canvas(),registry,view,cache,{lookAhead:{x:-1,z:0}});
 assert.equal(turn.active,25);
 assert.equal(cache.has('aden:-3:0'),true);
 assert.equal(cache.has('aden:3:0'),false);
});
test('invalid directional hints never permit fabricated or infinite geometry',()=>{
 for(const lookAhead of [null,{x:0,z:0},{x:NaN,z:1},{x:Infinity,z:0},{x:'1',z:0}])
  assert.throws(()=>Tiles.planStreaming(0,0,registry,[],{
   radius:3,maxLoaded:25,lookAhead}),/look-ahead/);
 const standard=Tiles.planStreaming(0,0,registry,[],{radius:2,maxLoaded:25});
 assert.equal(standard.active.length,25);
 assert.equal(standard.deferred.length,0);
});
