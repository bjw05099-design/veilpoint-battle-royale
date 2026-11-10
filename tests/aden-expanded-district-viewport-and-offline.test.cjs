'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Explorer=require('../src/aden-city-explorer.js');
const Districts=require('../src/aden-preview-districts.js');
const Story=require('../src/story-slice.js');
const Sim=require('../src/simulation.js');
const {collectFiles,referencedAssets}=require('../scripts/package-offline-demo.cjs');
function makeCanvas(){
 const tracker={terrainPaints:0,blocks:0},ctx={
  fillStyle:'',strokeStyle:'',lineWidth:1,
  fillRect(){tracker.blocks++},strokeRect(){},beginPath(){},
  moveTo(){},lineTo(){},closePath(){},fill(){tracker.terrainPaints++},stroke(){}
 };
 return {canvas:{width:1280,height:720,clientWidth:1280,clientHeight:720,
  getContext:()=>ctx},tracker};
}
test('new original neighborhoods visibly extend existing city blocks across terrain tiles and view movement',()=>{
 const cache=new Map(),registry=Explorer.createPreviewRegistry(),f=makeCanvas();
 const original=Explorer.draw(f.canvas,registry,Explorer.viewState(),cache);
 assert.equal(original.housesVisible,105);
 assert.ok(original.districtBuildingsVisible>=75);
 assert.ok(original.districtsVisible>=3);
 assert.ok(original.roadTriangles>2208,'new district streets are rendered in addition to existing routes');
 assert.equal(f.tracker.terrainPaints,original.triangles+original.roadTriangles);
 assert.equal(original.realAdenTilesLoaded,0);
 const western=Explorer.draw(f.canvas,registry,
  Explorer.viewState({x:-760,z:700,zoom:1.2}),new Map());
 assert.ok(western.districtBuildingsVisible>=20);
 assert.ok(western.districtsVisible>=1);
 const eastern=Explorer.draw(f.canvas,registry,
  Explorer.viewState({x:790,z:350,zoom:1.2}),new Map());
 assert.ok(eastern.districtBuildingsVisible>=20);
 assert.ok(eastern.roadTriangles>0);
 assert.equal(registry.size,25,'new visual houses do not duplicate or mutate elevation tiles');
 assert.equal(cache.size,25,'new city shape does not multiply the LOD terrain cache');
});
test('no fictional district buildings are drawn on missing or external unreviewed terrain, BR and CH01 saves unchanged',()=>{
 const f=makeCanvas(),state=Explorer.viewState(),registry=Explorer.createPreviewRegistry();
 const checkpoint=Story.serialize(Story.createState()),match=Sim.newMatch(704,0);
 const before=JSON.stringify(match.obstacles);
 const imported=Explorer.draw(f.canvas,registry,state,new Map(),
  {imported:true,showFictionalBuildings:false});
 assert.equal(imported.districtBuildingsVisible,0);
 assert.equal(imported.housesVisible,0);
 assert.equal(imported.roadTriangles,0);
 const empty=Explorer.draw(f.canvas,new Map(),state,new Map());
 assert.equal(empty.districtBuildingsVisible,0);
 assert.equal(empty.roadTriangles,0);
 assert.equal(empty.centerElevationMetres,null);
 assert.equal(Story.serialize(Story.restore(checkpoint)),checkpoint);
 assert.equal(JSON.stringify(match.obstacles),before);
 assert.equal(Districts.collisionAuthored,false);
});
test('local offline demo contains all new city district script sources and truthful standalone provenance',()=>{
 const page=fs.readFileSync(path.resolve(__dirname,'../terrain.html'),'utf8');
 const files=collectFiles().map(entry=>entry.name);
 const scripts=['src/aden-citywide-tiles.js','src/aden-map-relief.js',
  'src/aden-preview-streets.js','src/aden-preview-districts.js',
  'src/aden-city-walking-probe.js','src/aden-city-explorer.js','src/aden-city-explorer-init.js'];
 assert.deepEqual(referencedAssets('terrain.html',page),scripts);
 assert.ok(scripts.every(p=>files.includes(p)));
 assert.match(page,/id="fictionalDistrictLegend"/);
 assert.match(page,/창작 추가 8구역/);
 assert.match(page,/실제 아덴 고도·해안선·건물 데이터는 아직 적용되지 않았습니다/);
 const context=vm.createContext({});
 for(const file of scripts.slice(0,6))
  vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../'+file),'utf8'),context);
 assert.equal(context.VeilpointAdenPreviewDistricts.PLAN.buildings.length,224);
 assert.equal(context.VeilpointAdenPreviewDistricts.verifiedAdenCityBuildings,0);
 assert.equal(context.VeilpointAdenCityExplorer.createPreviewRegistry().size,25);
});
test('import selection and sample reset keep fictional district UI disclosure honest',()=>{
 const ui={},calls={};
 const ctx={fillRect(){},strokeRect(){},beginPath(){},moveTo(){},
  lineTo(){},closePath(){},fill(){},stroke(){}};
 const canvas={width:1280,height:720,clientWidth:1280,clientHeight:720,getContext:()=>ctx};
 const doc={getElementById(id){
  if(id==='terrainCanvas')return canvas;
  if(id==='tileStatus')return {textContent:''};
  if(!ui[id])ui[id]={hidden:false,textContent:'',addEventListener:(type,fn)=>{calls[id]=fn}};
  return ui[id];
 }};
 const app=Explorer.attach(doc);
 assert.equal(ui.fictionalDistrictLegend.hidden,false);
 const data={format:'veilpoint-heightfield-v1',
  coordinateSystem:'local-metre-unreferenced',title:'Unreviewed local visual DEM',
  tiles:[{tx:0,tz:0,gridSize:17,source:Explorer.SOURCE,samples:Array(289).fill(33)}]};
 const imported=app.loadDataset(data);
 assert.equal(imported.tilesImported,1);
 assert.equal(ui.fictionalDistrictLegend.hidden,true);
 assert.equal(ui.fictionalStreetLegend.hidden,true);
 app.resetSample();
 assert.equal(ui.fictionalDistrictLegend.hidden,false);
 assert.equal(app.getRegistry().size,25);
});
