'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Explorer=require('../src/aden-city-explorer.js');
const Story=require('../src/story-slice.js');
const Tiles=require('../src/aden-citywide-tiles.js');
const SOURCE=Explorer.SOURCE;
function raw(tx,shift=0){
 const n=17;
 return {tx,tz:0,gridSize:n,source:SOURCE,
  samples:Array.from({length:n*n},(_,i)=>{
   const x=tx*512+(i%n)*32,z=Math.floor(i/n)*32;
   return 14+.015*x+.006*z+shift;
  })};
}
function dataset(tx,shift=0){return {format:'veilpoint-heightfield-v1',
 coordinateSystem:'local-metre-unreferenced',
 title:'Original non-georeferenced city expansion test',
 tiles:[raw(tx,shift)]};}
function ui(){
 const events={};const nothing=()=>{};
 const ctx={fillRect:nothing,strokeRect:nothing,beginPath:nothing,moveTo:nothing,
  lineTo:nothing,closePath:nothing,fill:nothing,stroke:nothing};
 const status={textContent:''},legend={textContent:''},houses={hidden:false};
 const canvas={width:1280,height:720,clientWidth:1280,clientHeight:720,getContext:()=>ctx};
 const doc={getElementById(id){
  if(id==='terrainCanvas')return canvas;
  if(id==='tileStatus')return status;
  if(id==='mapLegendTitle')return legend;
  if(id==='fictionalHouseLegend')return houses;
  return {addEventListener(type,cb){if(type==='change')events[id]=cb}};
 }};
 return {app:Explorer.attach(doc),events,status,legend,houses};
}
function pending(){let resolve;const promise=new Promise(done=>{resolve=done});return {promise,resolve};}
function select(events,id,contents,size=300){
 return events[id]({target:{files:[{size,text:()=>contents}]}});
}
test('append button replaces fictional sample once then accumulates physical new tiles without camera jump',()=>{
 const h=ui(),a=h.app,before=Story.serialize(Story.createState());
 assert.equal(a.getRegistry().size,25);
 const first=a.appendDataset(dataset(4));
 assert.equal(first.tilesImported,1,'synthetic sample tiles are never silently fused into imported data');
 assert.equal(first.filesImported,1);
 assert.equal(a.getState().x,4*512+256);
 const old=a.getRegistry().get('aden:4:0'),focus=a.getState();
 const second=a.appendDataset(dataset(5));
 assert.equal(second.tilesImported,2);
 assert.equal(second.filesImported,2);
 assert.equal(second.seams,1);
 assert.strictEqual(a.getRegistry().get('aden:4:0'),old);
 assert.deepEqual(a.getState(),focus,'adding a neighboring tile must not jerk the camera');
 assert.equal(h.houses.hidden,true);
 assert.match(h.status.textContent,/2개 타일/);
 assert.match(h.status.textContent,/2개 파일/);
 assert.match(h.status.textContent,/실제 아덴 검증 0타일/);
 a.action('east');a.action('east');a.action('east');a.action('east');
 assert.match(h.status.textContent,/aden:5:0/);
 assert.ok(a.getRegistry().has('aden:5:0'));
 assert.equal(Story.serialize(Story.createState()),before);
});
test('failed additions reject the whole import without replacing current zoom, tiles or imported geometry',()=>{
 const h=ui(),a=h.app;
 a.loadDataset(dataset(0));a.action('zoomIn');
 const reg=a.getRegistry(),before=a.getDataset(),focus=a.getState();
 for(const candidate of [dataset(0),dataset(1,2)]){
  assert.throws(()=>a.appendDataset(candidate),/Duplicate imported terrain tile|boundary mismatch/);
  assert.strictEqual(a.getRegistry(),reg);
  assert.strictEqual(a.getDataset(),before);
  assert.strictEqual(a.getState(),focus);
 }
 const invalid=dataset(1);
 invalid.tiles[0].source={...SOURCE,license:''};
 assert.throws(()=>a.appendDataset(invalid),/Unverified geographic source/);
 assert.strictEqual(a.getDataset(),before);
 const replacement=a.loadDataset(dataset(3));
 assert.equal(replacement.tilesImported,1,'explicit replace remains available');
 assert.equal(replacement.filesImported,1);
 assert.equal(a.getRegistry().has('aden:0:0'),false);
 assert.equal(a.getRegistry().has('aden:3:0'),true);
 a.resetSample();
 assert.equal(a.getRegistry().size,25);
 assert.equal(a.getDataset(),null);
 assert.equal(h.houses.hidden,false);
});
test('two file inputs use one monotonic selection generation across delayed append, replace, and reset',async()=>{
 const h=ui(),a=h.app;
 assert.equal(typeof h.events.heightFile,'function');
 assert.equal(typeof h.events.appendHeightFile,'function');
 const late=pending(),oldAppend=select(h.events,'appendHeightFile',late.promise);
 await select(h.events,'heightFile',Promise.resolve(JSON.stringify(dataset(2))));
 const stable=a.getDataset();
 late.resolve(JSON.stringify(dataset(7)));await oldAppend;
 assert.strictEqual(a.getDataset(),stable,'older append cannot revive after a newer replace');
 assert.equal(a.getRegistry().has('aden:7:0'),false);
 const staleReplace=pending(),oldReplace=select(h.events,'heightFile',staleReplace.promise);
 await select(h.events,'appendHeightFile',Promise.resolve(JSON.stringify(dataset(3))));
 const combined=a.getDataset();
 assert.equal(combined.tilesImported,2);
 staleReplace.resolve(JSON.stringify(dataset(1)));await oldReplace;
 assert.strictEqual(a.getDataset(),combined);
 assert.equal(a.getRegistry().has('aden:1:0'),false);
 const blocked=pending(),stale=select(h.events,'appendHeightFile',blocked.promise);
 await select(h.events,'appendHeightFile',Promise.resolve(JSON.stringify(dataset(3))));
 assert.match(h.status.textContent,/지형 입력 거부/);
 assert.strictEqual(a.getDataset(),combined);
 blocked.resolve(JSON.stringify(dataset(4)));await stale;
 assert.equal(a.getRegistry().has('aden:4:0'),false);
 const onReset=pending(),staleOnReset=select(h.events,'appendHeightFile',onReset.promise);
 a.resetSample();
 onReset.resolve(JSON.stringify(dataset(5)));await staleOnReset;
 assert.equal(a.getDataset(),null);
 assert.equal(a.getRegistry().size,25);
 await select(h.events,'appendHeightFile',Promise.resolve(JSON.stringify(dataset(9))),5*1024*1024);
 assert.match(h.status.textContent,/4MB 이하/);
 assert.equal(a.getRegistry().size,25);
});
test('local terrain HTML exposes separate accessible add and replace controls without network or new bundle dependencies',()=>{
 const html=fs.readFileSync(path.resolve(__dirname,'../terrain.html'),'utf8');
 const source=fs.readFileSync(path.resolve(__dirname,'../src/aden-city-explorer.js'),'utf8');
 assert.match(html,/id="heightFile" type="file" accept="\.json,application\/json"/);
 assert.match(html,/id="appendHeightFile" type="file" accept="\.json,application\/json"/);
 assert.match(html,/기존 로컬 지형 유지하고 512m 타일 추가/);
 assert.match(html,/실제 아덴 고도·해안선·건물 데이터는 아직 적용되지 않았습니다/);
 assert.doesNotMatch(source,/\b(?:fetch|XMLHttpRequest|WebSocket|sendBeacon)\s*\(/);
 assert.match(source,/file\.size>4\*1024\*1024/);
 assert.match(source,/fileSelectionRevision/);
 assert.match(source,/Tiles\.mergeHeightRegistries\(registry,parsed\.registry\)/);
 assert.equal(Tiles.TILE_METRES,512);
});
