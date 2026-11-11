'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Tiles=require('../src/aden-citywide-tiles.js');
const Explorer=require('../src/aden-city-explorer.js');
const {collectFiles,referencedAssets}=require('../scripts/package-offline-demo.cjs');
function fakeCanvas(width=1280,height=720){
 const data={fills:0,paths:0,tiles:0};
 const ctx={fillStyle:'',strokeStyle:'',lineWidth:1,
  fillRect(){data.fills++},beginPath(){},moveTo(){},lineTo(){},closePath(){},
  fill(){data.paths++},stroke(){},strokeRect(){data.tiles++}};
 return {canvas:{width,height,clientWidth:width,clientHeight:height,getContext:()=>ctx},data};
}
test('actually streamed 25 synthetic 512m squares stitch exactly across all east and south neighbors',()=>{
 const registry=Explorer.createPreviewRegistry();
 assert.equal(registry.size,25);
 assert.equal(Explorer.SOURCE.type,'artist-blockout');
 assert.match(Explorer.SOURCE.license,/not a real Aden DEM/);
 for(const [key,tile] of registry){
  assert.equal(tile.quality,'blockout');
  assert.equal(tile.gridSize,33);
  const east=registry.get(Tiles.tileKey(tile.tx+1,tile.tz)),
   south=registry.get(Tiles.tileKey(tile.tx,tile.tz+1));
  for(const next of [east,south]){
   if(!next)continue;
   const seam=Tiles.auditSeam(tile,next,.0001);
   assert.equal(seam.pass,true,'no adjacent heightfield crack at '+key);
   assert.ok(seam.maxGapMetres<1e-9);
  }
 }
});
test('viewer renders real visible terrain triangles, original civic roofs and live tile/LOD statistics',()=>{
 const registry=Explorer.createPreviewRegistry(),cache=new Map();
 const {canvas,data}=fakeCanvas();
 const one=Explorer.draw(canvas,registry,Explorer.viewState(),cache);
 assert.equal(one.realAdenTilesLoaded,0);
 assert.equal(one.provenance,'artist-blockout');
 assert.equal(one.origin,'aden:0:0');
 assert.equal(one.active,25);
 assert.equal(one.unresolved,0);
 assert.equal(one.lodStep,2);
 assert.ok(one.triangles>=2500);
 assert.ok(one.housesVisible>50);
 assert.ok(one.roadTriangles>0,'fictional road surfaces render on the loaded land');
 assert.equal(data.paths,one.triangles+one.roadTriangles);
 assert.equal(cache.size,25);
 const two=Explorer.draw(canvas,registry,Explorer.setZoom(Explorer.viewState(),.30),cache);
 assert.equal(two.lodStep,4);
 assert.ok(two.triangles<one.triangles);
 assert.equal(cache.get('aden:0:0').lod,4);
 const third=Explorer.draw(canvas,registry,Explorer.viewState({x:512,z:0}),cache);
 assert.equal(third.origin,'aden:1:0');
 assert.equal(third.active,20,'only source-registered tiles are shown');
 assert.equal(third.unresolved,5);
 assert.ok(!cache.has('aden:-2:0'),'old far tile evicted on eastward movement');
 assert.equal(third.realAdenTilesLoaded,0);
});
test('actual preview UI supports button-driven metre movement and clearly reports synthetic coverage',()=>{
 const {canvas}=fakeCanvas(1024,600),buttons=new Map();
 const doc={
  getElementById(id){
   if(id==='terrainCanvas')return canvas;
   if(id==='tileStatus')return status;
   if(!buttons.has(id))buttons.set(id,{
    addEventListener(_event,callback){this.click=callback}});
   return buttons.get(id);
  }
 };
 const status={textContent:''};
 const app=Explorer.attach(doc);
 assert.ok(app);
 assert.equal(app.getState().x,0);
 assert.match(status.textContent,/실측 아덴 0타일/);
 app.action('east');app.action('east');app.action('east');app.action('east');
 assert.equal(app.getState().x,512);
 assert.match(status.textContent,/aden:1:0/);
 buttons.get('north').click();
 assert.equal(app.getState().z,-128);
 buttons.get('reset').click();
 assert.equal(app.getState().x,0);
 assert.equal(app.getState().z,0);
 app.action('zoomIn');
 assert.ok(app.getState().zoom>.63);
 const key=Tiles.tileFor(-.01,-512.01);
 assert.deepEqual(key,{tx:-1,tz:-2,key:'aden:-1:-2'});
});
test('offline delivery has an independent local terrain page, a clear non-surveyed disclosure, and all scripts',()=>{
 const html=fs.readFileSync(path.resolve(__dirname,'../terrain.html'),'utf8');
 assert.match(html,/실제 아덴 고도·해안선·건물 데이터는 아직 적용되지 않았습니다/);
 assert.match(html,/id="terrainCanvas"/);
 assert.match(html,/src="src\/aden-citywide-tiles\.js"/);
 assert.match(html,/src="src\/aden-map-relief\.js"/);
 assert.match(html,/src="src\/aden-city-explorer\.js"/);
 assert.match(html,/src="src\/aden-city-explorer-init\.js"/);
 assert.match(html,/href="index\.html"/);
 const index=fs.readFileSync(path.resolve(__dirname,'../index.html'),'utf8');
 assert.match(index,/id="terrainLabEntry" href="terrain\.html"/);
 assert.match(index,/창작 테스트 지형이며 실제 아덴 DEM이 아닙니다/);
 const files=collectFiles().map(x=>x.name);
 for(const name of ['terrain.html','src/aden-citywide-tiles.js',
   'src/aden-map-relief.js','src/aden-preview-streets.js',
   'src/aden-preview-districts.js','src/aden-city-walking-probe.js','src/aden-civilian-walk-route.js','src/aden-street-perspective.js','src/aden-city-explorer.js',
   'src/aden-city-explorer-init.js']){
  assert.ok(files.includes(name),'bundled: '+name);
 }
 assert.deepEqual(referencedAssets('terrain.html',html),[
  'src/aden-citywide-tiles.js','src/aden-map-relief.js',
  'src/aden-preview-streets.js','src/aden-preview-districts.js',
  'src/aden-city-walking-probe.js','src/aden-civilian-walk-route.js','src/aden-street-perspective.js','src/aden-city-explorer.js','src/aden-city-explorer-init.js']);
 assert.doesNotMatch(html,/<script>(?!<\/script>)/);
});
test('browser global setup loads from local assets without network access or browser-specific APIs',()=>{
 const lib=fs.readFileSync(path.resolve(__dirname,'../src/aden-citywide-tiles.js'),'utf8'),
  relief=fs.readFileSync(path.resolve(__dirname,'../src/aden-map-relief.js'),'utf8'),
  viewer=fs.readFileSync(path.resolve(__dirname,'../src/aden-city-explorer.js'),'utf8');
 const context=vm.createContext({});
 vm.runInContext(lib,context);
 vm.runInContext(relief,context);
 vm.runInContext(viewer,context);
 assert.equal(context.VeilpointAdenCityTiles.TILE_METRES,512);
 assert.equal(context.VeilpointAdenCityExplorer.createPreviewRegistry().size,25);
});

test('physical shoreline follows actual locally loaded 512m terrain triangles and never invents missing coastline',()=>{
 const tile=Tiles.createHeightTile({tx:0,tz:0,gridSize:17,source:Explorer.SOURCE,
  samples:Array.from({length:17*17},(_,i)=>i%17-7.5)});
 const mesh=Tiles.buildTerrainMesh(tile,1);
 const segments=Explorer.shorelineSegments(mesh);
 assert.ok(segments.length>0);
 for(const [a,b] of segments)for(const [x,z] of [a,b]){
  assert.ok(x>=0&&x<=512&&z>=0&&z<=512);
  assert.ok(Math.abs(x-240)<.00001,'interpolated physical coast must follow equal-height x coordinate');
 }
 assert.throws(()=>Explorer.shorelineSegments(mesh,NaN),/shoreline mesh or sea level/);
 const zero=Tiles.createHeightTile({tx:0,tz:0,gridSize:17,source:Explorer.SOURCE,
  samples:Array(17*17).fill(0)});
 assert.equal(Explorer.shorelineSegments(Tiles.buildTerrainMesh(zero,1)).length,0,
  'all-zero triangles are not a fabricated closed shoreline');
 const {canvas}=fakeCanvas();
 const registry=Explorer.createPreviewRegistry(),cache=new Map();
 const near=Explorer.draw(canvas,registry,Explorer.viewState({x:-768,z:0}),cache);
 assert.ok(near.shorelineSegments>0);
 assert.equal(near.realAdenTilesLoaded,0);
 const switched=Explorer.draw(canvas,registry,Explorer.setContours(
  Explorer.viewState({x:-768,z:0}),false),cache);
 assert.equal(switched.shorelineSegments,0);
 assert.equal(cache.get('aden:-2:0').shoreline.length>0,true);
 const far=Explorer.draw(canvas,new Map(),Explorer.viewState({x:-768,z:0}));
 assert.equal(far.shorelineSegments,0,'unresolved local tile cannot fake a coast');
 assert.equal(far.unresolved>0,true);
});
