'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Explorer=require('../src/aden-city-explorer.js');
const Tiles=require('../src/aden-citywide-tiles.js');
const source=Object.freeze({
 provider:'Original civilian test fixture',observedDate:'2026-11-10',
 license:'Original fixture',reference:'locally authored height grid',
 scope:'public-terrain',type:'artist-blockout'
});
const tile=(tx,tz,elevation=20)=>({
 tx,tz,gridSize:17,samples:Array(17*17).fill(elevation),source
});
const dataset=tiles=>({
 format:'veilpoint-heightfield-v1',
 coordinateSystem:'local-metre-unreferenced',
 title:'Local public terrain with sparse coverage',tiles
});
function docFixture(){
 const cv={width:1024,height:600,clientWidth:1024,clientHeight:600,
  getContext(){return {
   fillRect(){},strokeRect(){},beginPath(){},moveTo(){},lineTo(){},
   closePath(){},fill(){},stroke(){}
  }}};
 const nodes={terrainCanvas:cv,tileStatus:{textContent:''},
  mapLegendTitle:{textContent:''},fictionalHouseLegend:{hidden:false}};
 return {nodes,getElementById(id){
  if(!nodes[id])nodes[id]={addEventListener(){}};
  return nodes[id];
 }};
}
test('imported terrain auto-focuses on actual sparse local tile rather than the fictional origin',()=>{
 const doc=docFixture(),viewer=Explorer.attach(doc);
 assert.deepEqual(viewer.getState().x,0);
 const data=dataset([tile(8,-6,42)]);
 const imported=viewer.loadDataset(data);
 const state=viewer.getState();
 assert.equal(imported.tilesImported,1);
 assert.equal(state.x,8*Tiles.TILE_METRES+Tiles.TILE_METRES/2);
 assert.equal(state.z,-6*Tiles.TILE_METRES+Tiles.TILE_METRES/2);
 assert.equal(Tiles.tileFor(state.x,state.z).key,'aden:8:-6');
 assert.match(doc.nodes.tileStatus.textContent,/현재 메시 표면 42\.00m/);
 assert.match(doc.nodes.tileStatus.textContent,/실제 아덴 검증 0타일/);
 assert.equal(doc.nodes.fictionalHouseLegend.hidden,true);
 viewer.resetSample();
 assert.equal(viewer.getState().x,0);
 assert.equal(viewer.getState().z,0);
 assert.equal(doc.nodes.fictionalHouseLegend.hidden,false);
});
test('sparse separated tiles focus nearest actual tile to bounds center, never an unregistered gap',()=>{
 const registry=Tiles.createRegistry([
  Tiles.createHeightTile(tile(-10,4,3)),
  Tiles.createHeightTile(tile(0,4,3)),
  Tiles.createHeightTile(tile(9,4,3))
 ]);
 const focus=Explorer.importedTerrainFocus(registry);
 assert.ok(registry.has(focus.key));
 assert.equal(focus.key,'aden:0:4');
 assert.equal(Tiles.tileFor(focus.x,focus.z).key,focus.key);
 assert.ok(Object.isFrozen(focus));
});
test('invalid or out-of-range imported dataset preserves the previous playable local terrain view',()=>{
 const doc=docFixture(),viewer=Explorer.attach(doc);
 viewer.loadDataset(dataset([tile(3,2)]));
 const previous=viewer.getState(),oldRegistry=viewer.getRegistry();
 assert.throws(()=>viewer.loadDataset(dataset([tile(3,2),tile(3,2)])),
  /Duplicate tile/);
 assert.equal(viewer.getState(),previous);
 assert.equal(viewer.getRegistry(),oldRegistry);
 assert.throws(()=>viewer.loadDataset(dataset([tile(1953,1953)])),
  /outside the viewable local coordinates/);
 assert.equal(viewer.getState(),previous);
 assert.equal(viewer.getRegistry(),oldRegistry);
 assert.match(doc.nodes.tileStatus.textContent,/실제 아덴 검증 0타일/);
});
