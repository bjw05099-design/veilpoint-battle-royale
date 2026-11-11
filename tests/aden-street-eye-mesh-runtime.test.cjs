'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const Tiles=require('../src/aden-citywide-tiles.js');
const Explorer=require('../src/aden-city-explorer.js');
const Eye=require('../src/aden-street-perspective.js');
const Walk=require('../src/aden-city-walking-probe.js');
const Districts=require('../src/aden-preview-districts.js');

function canvas(){
 const log={fills:0,polygons:0};
 const ctx={fillStyle:'',strokeStyle:'',lineWidth:1,
  fillRect(){log.fills++;},strokeRect(){},beginPath(){log.polygons++;},
  moveTo(){},lineTo(){},closePath(){},fill(){log.fills++;},
  stroke(){}};
 return {node:{width:1280,height:720,getContext:()=>ctx},log};
}
test('street eye projects true local metres with a finite near plane, not an invented georeferenced map',()=>{
 const eye={x:0,y:2,z:0};
 const front=Eye.project(eye,0,{x:0,y:0,z:-20},1280,720);
 assert.ok(front);
 assert.equal(front.x,640);
 assert.ok(front.y>360&&front.y<720);
 assert.equal(Eye.project(eye,0,{x:0,y:0,z:20},1280,720),null,
  'no terrain behind the actual viewing direction');
 assert.equal(Eye.project(eye,0,{x:0,y:0,z:-10000},1280,720),null);
 assert.equal(Eye.project(eye,0,{x:0,y:0,z:-.1},1280,720),null);
 const clipped=Eye.clipNear([{right:-1,up:-1,depth:-1},
  {right:1,up:-1,depth:2},{right:0,up:1,depth:2}]);
 assert.equal(clipped.length,4);
 assert.ok(clipped.every(p=>p.depth>=Eye.NEAR));
});
test('real streamed artist terrain and grounded civilian facades render in the new eye-level PC camera',()=>{
 const registry=Explorer.createPreviewRegistry(1),cache=new Map(),c=canvas();
 Explorer.draw(c.node,registry,Explorer.viewState({zoom:1.2}),cache);
 const physical=Walk.createWorld(registry,cache,new Set(cache.keys()),
  [...Explorer.CIVIC_SHELLS,...Districts.PLAN.buildings]);
 const w=Walk.initial(physical,0,0);
 const results=Eye.draw(c.node,registry,cache,w,Math.PI/2,
  [...Explorer.CIVIC_SHELLS,...Districts.PLAN.buildings]);
 assert.equal(results.mode,'original-street-perspective');
 assert.equal(results.metresPerWorldUnit,1);
 assert.equal(results.eyeHeightMetres,1.65);
 assert.equal(results.geographicallyVerified,false);
 assert.equal(results.unrealNative,false);
 assert.equal(results.measuredGpuFps,null);
 assert.ok(results.terrainTiles>0&&results.trianglesConsidered>0);
 assert.ok(results.visibleFaces>0&&c.log.polygons>0);
 assert.ok(c.log.fills>0);
 assert.throws(()=>Eye.draw(c.node,registry,cache,{x:NaN,y:0,z:0},0),/Invalid/);
});
test('city lab exposes V street-camera toggle but retains original WASD 60Hz position and offline dependencies',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../terrain.html'),'utf8');
 const scripts=[...html.matchAll(/<script src="([^"]+)"/g)].map(x=>x[1]);
 assert.ok(scripts.includes('src/aden-street-perspective.js'));
 assert.ok(scripts.indexOf('src/aden-street-perspective.js')<
  scripts.indexOf('src/aden-city-explorer.js'));
 assert.match(html,/id="streetPerspective"[^>]*aria-pressed="false"/);
 const elements=new Map(),c=canvas();
 const doc={hidden:false,getElementById(id){
  if(id==='terrainCanvas')return c.node;
  if(!elements.has(id))elements.set(id,{textContent:'',hidden:false,
    addEventListener(){},setAttribute(name,val){this[name]=val;}});
  return elements.get(id);
 },addEventListener(){}};
 const app=Explorer.attach(doc);
 assert.equal(app.toggleStreetPerspective(),false,'walking must be physically active');
 assert.equal(app.toggleWalking(),true);
 const original=app.getWalk();
 assert.equal(app.toggleStreetPerspective(),true);
 assert.equal(app.getStreetPerspective(),true);
 assert.equal(elements.get('streetPerspective')['aria-pressed'],'true');
 assert.equal(app.walkStep({east:1},10),true);
 assert.equal(app.getWalk().tick,original.tick+10);
 assert.ok(app.getWalk().x>original.x);
 assert.equal(app.toggleStreetPerspective(),false);
 assert.equal(app.getStreetPerspective(),false);
 assert.equal(app.toggleWalking(),false);
 assert.equal(app.getStreetPerspective(),false);
});
