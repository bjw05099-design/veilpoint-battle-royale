'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Explorer=require('../src/aden-city-explorer.js');
const Tiles=require('../src/aden-citywide-tiles.js');

function scene(){
 const ctx={fillRect(){},strokeRect(){},beginPath(){},moveTo(){},
  lineTo(){},closePath(){},fill(){},stroke(){}};
 const canvas={width:1280,height:720,clientWidth:1280,clientHeight:720,
  getContext:()=>ctx};
 const status={textContent:''},controls=new Map();
 const doc={getElementById(id){
  if(id==='terrainCanvas')return canvas;
  if(id==='tileStatus')return status;
  if(!controls.has(id))controls.set(id,{hidden:false,attributes:{},
   addEventListener(){},setAttribute(k,v){this.attributes[k]=v}});
  return controls.get(id);
 }};
 return {doc,status};
}
test('same tile keys and same LOD cannot certify replaced civilian height meshes',()=>{
 const registry=Explorer.createPreviewRegistry();
 const tile=registry.get('aden:0:0'),a={sourceTile:tile,lod:2,mesh:Tiles.buildTerrainMesh(tile,2)};
 const cache=new Map([['aden:0:0',a]]),remember=Explorer.terrainRevision(cache);
 assert.equal(Explorer.terrainRevisionMatches(cache,remember),true);
 const replacement={...a,mesh:Tiles.buildTerrainMesh(tile,2)};
 cache.set('aden:0:0',replacement);
 assert.equal(Explorer.terrainRevisionMatches(cache,remember),false,
  'same LOD + same tile ID cannot hide new triangle geometry');
 const newer=Explorer.terrainRevision(cache);
 assert.equal(Explorer.terrainRevisionMatches(cache,newer),true);
 cache.set('aden:0:0',{...replacement,sourceTile:{...tile}});
 assert.equal(Explorer.terrainRevisionMatches(cache,newer),false,
  'even equal-looking imported source tiles must be revalidated');
 cache.delete('aden:0:0');
 assert.equal(Explorer.terrainRevisionMatches(cache,newer),false);
});
test('real PC city walker is blocked when a newly streamed same-LOD tile rises under its feet',()=>{
 const h=scene(),viewer=Explorer.attach(h.doc);
 viewer.action('east');viewer.action('east');
 viewer.action('south');viewer.action('south');
 assert.deepEqual([viewer.getState().x,viewer.getState().z],[256,256]);
 assert.equal(viewer.toggleWalking(),true);
 const first=viewer.getWalk(),registry=viewer.getRegistry();
 const oldTile=registry.get('aden:0:0');
 const sample=Array.from(oldTile.samples);
 sample[16*oldTile.gridSize+16]+=2.5;
 const replacement=Tiles.createHeightTile({
  tx:oldTile.tx,tz:oldTile.tz,gridSize:oldTile.gridSize,
  source:oldTile.source,samples:sample
 });
 // This is an original synthetic interior point; no map seam or licensed
 // geography is being fabricated. The visible terrain renderer reads it.
 registry.set('aden:0:0',replacement);
 viewer.refresh();
 assert.equal(viewer.walkStep({east:1},1),true);
 const actual=viewer.getWalk();
 assert.equal(actual.tick,first.tick+1);
 assert.equal(actual.blocked,true,'old ground must not be treated as current collision');
 assert.deepEqual([actual.x,actual.z,actual.y],[first.x,first.z,first.y],
  'the character cannot teleport vertically or pass through an unloaded slope');
 assert.match(h.status.textContent,/실측 아덴 0타일/);
});
