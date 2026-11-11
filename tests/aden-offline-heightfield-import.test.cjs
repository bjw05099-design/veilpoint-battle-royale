'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const Tiles=require('../src/aden-citywide-tiles.js');
const Explorer=require('../src/aden-city-explorer.js');
function testTile(tx,tz,shift=0,n=17){
 const d=512/(n-1);
 return {tx,tz,gridSize:n,source:{
  provider:'Original terrain testing team',
  observedDate:'2026-11-10',
  license:'Original fictional art, no outside data',
  reference:'original generated elevation continuity fixture',
  scope:'public-terrain',type:'artist-blockout'},
  samples:Array.from({length:n*n},(_,i)=>
   12+.013*(tx*512+(i%n)*d)+.009*(tz*512+Math.floor(i/n)*d)+shift)
 };
}
function payload(tiles=[testTile(0,0),testTile(1,0)]){
 return {format:'veilpoint-heightfield-v1',
  coordinateSystem:'local-metre-unreferenced',
  title:'Synthetic local 512m elevation tiles',tiles};
}
function fakeCanvas(){
 const values={fills:0,paths:0};
 const ctx={fillStyle:'',strokeStyle:'',lineWidth:1,
  fillRect(){values.fills++},beginPath(){},moveTo(){},lineTo(){},
  closePath(){},fill(){values.paths++},stroke(){},strokeRect(){}};
 return {canvas:{width:960,height:600,clientWidth:960,clientHeight:600,
  getContext:()=>ctx},values};
}
function fakeDocument(){
 const {canvas}=fakeCanvas(),status={textContent:''},events={},
  legend={textContent:''},houses={hidden:false};
 return {
  status,events,legend,houses,
  getElementById(id){
   if(id==='terrainCanvas')return canvas;
   if(id==='tileStatus')return status;
   if(id==='mapLegendTitle')return legend;
   if(id==='fictionalHouseLegend')return houses;
   return {addEventListener(_kind,fn){events[id]=fn}};
  }
 };
}
test('local elevation JSON validates canonical coordinate system, provenance and 1:1 seam continuity',()=>{
 const imported=Tiles.importHeightDataset(payload());
 assert.equal(imported.tilesImported,2);
 assert.equal(imported.seams,1);
 assert.equal(imported.registry.size,2);
 assert.equal(imported.unreviewed,true);
 assert.equal(imported.localOnly,true);
 assert.equal(imported.accuracy,'source-declared-unverified');
 assert.ok(Object.isFrozen(imported));
 assert.equal(Tiles.auditRegistrySeams(imported.registry).pass,true);
 assert.equal(Tiles.heightAt(imported.registry.get('aden:1:0'),512,0),
  Tiles.heightAt(imported.registry.get('aden:0:0'),512,0));
 assert.deepEqual(Tiles.tileBounds(1,0).maxX,1024);
});
test('rejects unsupported georeferencing, facility metadata and silently mismatched civilian terrain',()=>{
 const base=payload();
 for(const field of ['originLatitude','longitude','facilityLocations','currentCheckpoints']){
  assert.throws(()=>Tiles.importHeightDataset({...base,[field]:33}),
   /Invalid offline heightfield document/);
 }
 assert.throws(()=>Tiles.importHeightDataset({...base,coordinateSystem:'WGS84'}),
  /Invalid offline heightfield document/);
 assert.throws(()=>Tiles.importHeightDataset({...base,tiles:[
  {...testTile(0,0),sensitiveFacility:'not allowed'}]}),
  /Invalid elevation-only tile record/);
 assert.throws(()=>Tiles.importHeightDataset({...base,tiles:[
  {...testTile(0,0),source:{...testTile(0,0).source,
    currentMilitaryFacilities:[]}}]}),
  /Invalid elevation-only tile record/);
 assert.throws(()=>Tiles.importHeightDataset({...base,tiles:[testTile(0,0),testTile(0,0)]}),
  /Duplicate tile/);
 assert.throws(()=>Tiles.importHeightDataset({...base,tiles:[testTile(0,0),testTile(1,0,2)]}),
  /boundary mismatch/);
 const mixed=Tiles.importHeightDataset({...base,tiles:[testTile(0,0),testTile(1,0,0,33)]});
 assert.equal(mixed.seams,1);
 assert.equal(mixed.registry.get('aden:1:0').gridSize,33);
 assert.equal(mixed.unreviewed,true,'mixed resolution does not certify external DEM provenance');
 assert.throws(()=>Tiles.importHeightDataset({...base,tiles:[]}),
  /Invalid offline heightfield document/);
 assert.throws(()=>Tiles.importHeightDataset({...base,tiles:Array(50).fill(testTile(0,0))}),
  /Invalid offline heightfield document/);
 assert.throws(()=>Tiles.importHeightDataset({...base,tiles:[
  {...testTile(0,0),samples:Array(289).fill(999999)}]}),
  /Invalid 1:1 metre height grid/);
 assert.throws(()=>Tiles.importHeightDataset({...base,tiles:[
  {...testTile(0,0),source:{...testTile(0,0).source,license:''}}]}),
  /Unverified geographic source/);
});
test('actual browser terrain renderer consumes imported local heightfield and stops showing fictitious houses',()=>{
 const ui=fakeDocument(),app=Explorer.attach(ui);
 const original=app.getRegistry();
 assert.equal(original.size,25);
 const imported=app.loadDataset(payload());
 assert.equal(imported.tilesImported,2);
 assert.equal(app.getRegistry().size,2);
 assert.equal(app.getDataset().accuracy,'source-declared-unverified');
 assert.match(ui.status.textContent,/외부 검증 전/);
 assert.match(ui.legend.textContent,/입력한 로컬 고도/);
 assert.equal(ui.houses.hidden,true);
 assert.match(ui.status.textContent,/실제 아덴 검증 0타일/);
 assert.doesNotMatch(ui.status.textContent,/실측 아덴 2타일/);
 const {canvas}=fakeCanvas();
 const report=Explorer.draw(canvas,app.getRegistry(),app.getState(),
  new Map(),{imported:true,showFictionalBuildings:false});
 assert.equal(report.realAdenTilesLoaded,0);
 assert.equal(report.provenance,'source-declared-unreviewed');
 assert.equal(report.housesVisible,0);
 assert.equal(report.active,2);
 assert.equal(report.unresolved,23);
 // Reject invalid file transactionally: the previously imported tiles stay.
 assert.throws(()=>app.loadDataset(payload([testTile(0,0),testTile(1,0,50)])),
  /boundary mismatch/);
 assert.strictEqual(app.getDataset(),imported);
 assert.equal(app.getRegistry().size,2);
 app.resetSample();
 assert.equal(app.getRegistry().size,25);
 assert.equal(app.getDataset(),null);
 assert.match(ui.status.textContent,/창작 아트 테스트/);
 assert.match(ui.legend.textContent,/원본 창작 지형/);
 assert.equal(ui.houses.hidden,false);
});
test('file input never downloads geometry and refuses oversized or malicious elevation files',async()=>{
 const ui=fakeDocument();Explorer.attach(ui);
 assert.equal(typeof ui.events.heightFile,'function');
 await ui.events.heightFile({target:{files:[{
  size:5*1024*1024,text:async()=>JSON.stringify(payload())}]}});
 assert.match(ui.status.textContent,/4MB 이하/);
 await ui.events.heightFile({target:{files:[{
  size:100,text:async()=>JSON.stringify(payload([testTile(0,0),testTile(1,0,3)]))}]}});
 assert.match(ui.status.textContent,/지형 입력 거부/);
 await ui.events.heightFile({target:{files:[{
  size:100,text:async()=>JSON.stringify(payload())}]}});
 assert.match(ui.status.textContent,/외부 검증 전/);
});
test('offline page visibly contains constrained file import and explicit unverified semantics',()=>{
 const html=fs.readFileSync(path.resolve(__dirname,'../terrain.html'),'utf8');
 const source=fs.readFileSync(path.resolve(__dirname,'../src/aden-city-explorer.js'),'utf8');
 assert.match(html,/type="file" accept="\.json,application\/json"/);
 assert.match(html,/id="heightFile"/);
 assert.match(html,/id="resetSample"/);
 assert.match(html,/id="relief"/);
 assert.match(html,/id="contours"/);
 assert.match(html,/실제 아덴 고도·해안선·건물 데이터는 아직 적용되지 않았습니다/);
 assert.doesNotMatch(source,/\b(?:fetch|XMLHttpRequest|WebSocket|sendBeacon)\s*\(/);
 assert.match(source,/file\.size>4\*1024\*1024/);
 assert.match(source,/Tiles\.importHeightDataset\(value\)/);
});
