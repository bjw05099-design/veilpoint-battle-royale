'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Explorer=require('../src/aden-city-explorer.js');
const Tiles=require('../src/aden-citywide-tiles.js');
function canvas(){
 const ctx={fillRect(){},strokeRect(){},beginPath(){},moveTo(){},lineTo(){},
  closePath(){},fill(){},stroke(){},lineWidth:1};
 return {width:1024,height:600,clientWidth:1024,clientHeight:600,
  getContext(){return ctx}};
}
function makeTile(height,source=Explorer.SOURCE){
 return Tiles.createHeightTile({tx:0,tz:0,gridSize:17,
  samples:Array(17*17).fill(height),source});
}
test('1:1 terrain viewer estimates crosshair elevation from the exact loaded 512m tile, not synthetic metadata',()=>{
 const registry=Tiles.createRegistry([makeTile(14.257)]);
 const cache=new Map(),draw=()=>Explorer.draw(canvas(),registry,
  Explorer.viewState({x:195,z:230}),cache,{showFictionalBuildings:false,imported:true});
 const result=draw();
 assert.equal(result.centerElevationMetres,14.26);
 assert.equal(result.localElevationOnly,true);
 assert.equal(result.provenance,'source-declared-unreviewed');
 assert.equal(result.realAdenTilesLoaded,0);
 assert.equal(result.active,1);
 assert.equal(result.unresolved,24,'unknown neighboring coverage stays unfilled');
 const first=cache.get('aden:0:0');
 assert.equal(first.sourceTile,registry.get('aden:0:0'));
 assert.equal(first.mesh.positions[1],14.257);
 assert.equal(draw().centerElevationMetres,14.26);
 assert.equal(cache.get('aden:0:0'),first,'same validated source, same LOD remains cached');
});
test('same-key new terrain import invalidates geometry and shoreline instead of showing an outdated heightfield',()=>{
 const cache=new Map(),view=Explorer.viewState({x:100,z:130,zoom:1.3});
 const base=Tiles.createRegistry([makeTile(30)]),next=Tiles.createRegistry([makeTile(-4)]);
 const a=Explorer.draw(canvas(),base,view,cache,{showFictionalBuildings:false});
 const old=cache.get('aden:0:0');
 assert.equal(a.centerElevationMetres,30);
 assert.equal(old.mesh.positions[1],30);
 assert.equal(old.shoreline.length,0);
 const b=Explorer.draw(canvas(),next,view,cache,{showFictionalBuildings:false,imported:true});
 assert.equal(b.centerElevationMetres,-4);
 assert.equal(b.localElevationOnly,true);
 assert.equal(b.realAdenTilesLoaded,0,
  'verified local geometry alone is not proof of licensed real Aden coverage');
 assert.notEqual(cache.get('aden:0:0'),old);
 assert.equal(cache.get('aden:0:0').mesh.positions[1],-4);
 assert.equal(cache.get('aden:0:0').sourceTile,next.get('aden:0:0'));
 const c=Explorer.draw(canvas(),new Map(),view,cache,{showFictionalBuildings:false});
 assert.equal(c.centerElevationMetres,null);
 assert.equal(c.active,0);
 assert.equal(c.unresolved,25);
 assert.equal(cache.size,0,'missing actual terrain must evict the prior licensed DEM geometry');
});
test('public terrain UI reports actual center local elevation and refuses to call imported data surveyed Aden',()=>{
 const cv=canvas(),status={textContent:''},buttons=new Map(),legend={textContent:''},
  houses={hidden:false};
 const doc={getElementById(id){
  if(id==='terrainCanvas')return cv;
  if(id==='tileStatus')return status;
  if(id==='mapLegendTitle')return legend;
  if(id==='fictionalHouseLegend')return houses;
  if(!buttons.has(id))buttons.set(id,{addEventListener(_event,fn){this.click=fn}});
  return buttons.get(id);
 }};
 const app=Explorer.attach(doc);
 assert.match(status.textContent,/현재 메시 표면/);
 assert.match(status.textContent,/현지 해발 미검증/);
 const source={provider:'Original civilian elevation fixture',observedDate:'2026-11-09',
   license:'CC-BY-4.0',reference:'local user-provided public DEM fixture',
   scope:'public-terrain',type:'licensed-dem'};
 const dataset={format:'veilpoint-heightfield-v1',
  coordinateSystem:'local-metre-unreferenced',title:'Public terrain input, unverified',
  tiles:[{tx:0,tz:0,gridSize:17,samples:Array(17*17).fill(35.75),source}]};
 app.loadDataset(dataset);
 assert.equal(app.getDataset().tilesImported,1);
 assert.match(status.textContent,/현재 메시 표면 35\.75m/);
 assert.match(status.textContent,/현지 해발 미검증/);
 assert.match(status.textContent,/실제 아덴 검증 0타일/);
 app.action('east');app.action('east');app.action('east');app.action('east');
 assert.match(status.textContent,/중심 표고 자료 없음/);
 assert.doesNotMatch(status.textContent,/현재 메시 표면 35\.75m/,
  'pan into an unregistered tile must not reuse a prior valid elevation label');
 app.resetSample();
 assert.match(status.textContent,/원본: 창작 아트 테스트/);
 assert.match(status.textContent,/실제 아덴 검증 0타일/);
 assert.equal(houses.hidden,false);
});
