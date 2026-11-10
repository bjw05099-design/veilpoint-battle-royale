'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Tiles=require('../src/aden-citywide-tiles.js');
const Explorer=require('../src/aden-city-explorer.js');
const Relief=require('../src/aden-map-relief.js');
function canvas(width=320,height=200){
 const strokes=[],rects=[];
 const ctx={fillStyle:'',strokeStyle:'',lineWidth:1,trace:[],
  beginPath(){this.trace=[]},moveTo(x,y){this.trace.push([x,y])},
  lineTo(x,y){this.trace.push([x,y])},closePath(){},fill(){},
  stroke(){strokes.push(this.trace.slice())},
  fillRect(x,y,w,h){rects.push({color:this.fillStyle,x,y,w,h})},
  strokeRect(){}
 };
 return {canvas:{width,height,clientWidth:width,clientHeight:height,getContext:()=>ctx},strokes,rects};
}
function near(a,b){assert.ok(Math.abs(a-b)<1e-6,`expected ${a} == ${b}`)}
test('actual 25 streamed tiles are retained, but off-screen terrain is not rasterized at small viewport',()=>{
 const registry=Explorer.createPreviewRegistry(),cache=new Map(),f=canvas();
 const s=Explorer.draw(f.canvas,registry,Explorer.viewState({zoom:1.1,showContours:false}),cache);
 assert.equal(s.active,25,'streaming still retains the full selected tile budget');
 assert.equal(cache.size,25);
 assert.ok(s.visibleTiles>0&&s.visibleTiles<s.active);
 assert.equal(s.visibleTiles+s.culledTiles,s.active);
 assert.equal(s.unresolved,0);
 assert.ok(s.triangles>0);
 assert.ok(s.centerSlopeDegrees>=0);
 assert.equal(s.centerElevationSurface,'painted-triangle');
});
test('elevated cliff is visible whenever height projection enters the viewport despite its sea-level footprint being offscreen',()=>{
 const tile=Tiles.createHeightTile({tx:0,tz:0,gridSize:17,source:Explorer.SOURCE,
  samples:Array.from({length:17*17},(_,i)=>i<17?1000:0)});
 const mesh=Tiles.buildTerrainMesh(tile,1);
 const state=Explorer.viewState({x:256,z:-300,zoom:.7,relief:1});
 assert.equal(Explorer.terrainTileVisible(mesh,state,320,200),true);
 const farther=Explorer.viewState({x:256,z:-3000,zoom:.7,relief:1});
 assert.equal(Explorer.terrainTileVisible(mesh,farther,320,200),false);
});
test('conceptual roofs and reticle use the same painted triangle elevation, never the bilinear sample',()=>{
 const home=Explorer.CIVIC_SHELLS[0],{tx,tz,key}=Tiles.tileFor(home.x,home.z),
    n=17,samples=Array.from({length:n*n},(_,i)=>((i%2)===0?5:25));
 const tile=Tiles.createHeightTile({tx,tz,gridSize:n,source:Explorer.SOURCE,samples});
 const registry=Tiles.createRegistry([tile]),cache=new Map(),f=canvas(1280,720),
  state=Explorer.viewState({x:home.x,z:home.z,zoom:1.3,relief:.6,showContours:false});
 const result=Explorer.draw(f.canvas,registry,state,cache);
 const mesh=cache.get(key).mesh,surface=Tiles.terrainSurface(mesh,home.x,home.z),
    raw=Tiles.heightAt(tile,home.x,home.z);
 assert.ok(Math.abs(surface.elevationMetres-raw)>.01,'different surface formulas in nonplanar cell');
 near(result.centerElevationMetres,Math.round(surface.elevationMetres*100)/100);
 near(result.centerSlopeDegrees,Math.round(surface.slopeDegrees*10)/10);
 const [px,py]=Relief.project([home.x,surface.elevationMetres,home.z],state,1280,720,state.zoom,state.relief);
 const roof=f.rects.find(x=>x.color===home.color&&Math.abs(x.x-(px-home.w*state.zoom/2))<1e-6);
 assert.ok(roof);
 near(roof.y,py-home.d*state.zoom/2-home.h*state.zoom*state.relief);
 const reticle=f.strokes.at(-1);
 assert.equal(reticle.length,4);
 near(reticle[0][0],px-7);near(reticle[0][1],py);
 const empty=canvas(1280,720),missing=Explorer.draw(empty.canvas,new Map(),state,new Map());
 assert.equal(missing.centerElevationMetres,null);
 assert.equal(missing.centerSlopeDegrees,null);
 assert.equal(empty.strokes.length,0,'no false reticle on missing geography');
});
