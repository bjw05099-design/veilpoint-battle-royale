'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Tiles=require('../src/aden-citywide-tiles.js');
const Explorer=require('../src/aden-city-explorer.js');
const {collectFiles,referencedAssets}=require('../scripts/package-offline-demo.cjs');
function fakeCanvas(){
 const stats={fills:0};
 const ctx={fillStyle:'',strokeStyle:'',lineWidth:1,
  fillRect(){},strokeRect(){},beginPath(){},moveTo(){},lineTo(){},
  closePath(){},fill(){stats.fills++},stroke(){}};
 return {canvas:{width:1280,height:720,clientWidth:1280,clientHeight:720,
  getContext:()=>ctx},stats};
}
test('standalone offline map loads terrain, relief, original road mesh and viewer in correct browser order',()=>{
 const html=fs.readFileSync(path.resolve(__dirname,'../terrain.html'),'utf8');
 const names=['src/aden-citywide-tiles.js','src/aden-map-relief.js',
  'src/aden-preview-streets.js','src/aden-city-explorer.js',
  'src/aden-city-explorer-init.js'];
 const indices=names.map(p=>html.indexOf('src="'+p+'"'));
 assert.ok(indices.every(i=>i>0));
 assert.deepEqual(indices,[...indices].sort((a,b)=>a-b));
 assert.deepEqual(referencedAssets('terrain.html',html),names);
 const packaged=collectFiles().map(x=>x.name);
 assert.ok(packaged.includes('src/aden-preview-streets.js'));
 assert.match(html,/id="fictionalStreetLegend"/);
 assert.match(html,/창작 도로망 \(충돌 없음\)/);
 assert.match(html,/실제 아덴 고도·해안선·건물 데이터는 아직 적용되지 않았습니다/);
 const context=vm.createContext({});
 for(const p of names.slice(0,4))
  vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../'+p),'utf8'),context);
 assert.equal(context.VeilpointAdenPreviewStreets.ROUTES.length,32);
 assert.equal(context.VeilpointAdenPreviewStreets.hasGameCollision,false);
 assert.equal(context.VeilpointAdenCityExplorer.createPreviewRegistry().size,25);
});
test('actual canvas reports painted roads only for authored sample and never for imported unreviewed terrain',()=>{
 const f=fakeCanvas(),reg=Explorer.createPreviewRegistry();
 const sample=Explorer.draw(f.canvas,reg,Explorer.viewState(),new Map());
 assert.ok(sample.roadTriangles>500);
 assert.equal(sample.realAdenTilesLoaded,0);
 assert.equal(f.stats.fills,sample.triangles+sample.roadTriangles);
 const original=fs.readFileSync(path.resolve(__dirname,'../src/aden-city-explorer.js'),'utf8');
 assert.match(original,/Streets\.triangulate\(registry,cache,renderedKeys\)/);
 const imported=Explorer.draw(f.canvas,reg,Explorer.viewState(),new Map(),
  {imported:true,showFictionalBuildings:false});
 assert.equal(imported.roadTriangles,0);
 assert.equal(imported.housesVisible,0);
 const missing=Explorer.draw(f.canvas,new Map(),Explorer.viewState(),new Map());
 assert.equal(missing.roadTriangles,0);
 assert.equal(missing.realAdenTilesLoaded,0);
});
test('map offline viewer hides original street legend when local DEM replaces the fictional blockout',()=>{
 const ids={},ctx={fillRect(){},strokeRect(){},beginPath(){},moveTo(){},
  lineTo(){},closePath(){},fill(){},stroke(){}};
 const doc={getElementById(id){
  if(id==='terrainCanvas')return {width:1280,height:720,clientWidth:1280,
   clientHeight:720,getContext:()=>ctx};
  if(id==='tileStatus')return {textContent:''};
  if(!ids[id])ids[id]={hidden:false,textContent:'',addEventListener(){}};
  return ids[id];
 }};
 const app=Explorer.attach(doc);
 assert.equal(ids.fictionalStreetLegend.hidden,false);
 const source=Explorer.SOURCE;
 const tile={tx:0,tz:0,gridSize:17,source,samples:Array(17*17).fill(30)};
 const data={format:'veilpoint-heightfield-v1',
  coordinateSystem:'local-metre-unreferenced',title:'Fictional local source',tiles:[tile]};
 const first=app.loadDataset(data);
 assert.equal(first.tilesImported,1);
 assert.equal(ids.fictionalStreetLegend.hidden,true);
 assert.equal(ids.fictionalHouseLegend.hidden,true);
 app.resetSample();
 assert.equal(ids.fictionalStreetLegend.hidden,false);
 assert.equal(app.getDataset(),null);
 assert.equal(Tiles.TILE_METRES,512);
});
