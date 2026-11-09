'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Relief=require('../src/aden-map-relief.js');
const Explorer=require('../src/aden-city-explorer.js');
test('surface-normal hillshade changes with actual terrain slope rather than randomized color',()=>{
 const flat=Relief.surfaceNormal([0,0,0],[0,0,20],[20,0,0]),
  inclined=Relief.surfaceNormal([0,0,0],[20,20,0],[0,0,20]);
 assert.equal(flat.y,1);
 assert.equal(flat.slope,0);
 assert.ok(inclined.slope>.7&&inclined.slope<1);
 const flatColor=Relief.triangleColor([0,40,0],[20,40,0],[0,40,20]),
  slopeColor=Relief.triangleColor([0,40,0],[20,55,0],[0,40,20]);
 assert.match(flatColor,/^rgb\(\d+,\d+,\d+\)$/);
 assert.match(slopeColor,/^rgb\(\d+,\d+,\d+\)$/);
 assert.notEqual(flatColor,slopeColor,'illumination must respond to the actual gradient');
 assert.equal(Relief.triangleColor([0,-5,0],[20,-5,0],[0,-5,20]).startsWith('rgb('),true);
 assert.throws(()=>Relief.surfaceNormal([0,NaN,0],[1,0,0],[0,0,1]),/Nonfinite/);
});
test('2.5D projection displaces elevations by honest metre scaling and flat mode is reversible',()=>{
 const cam={x:0,z:0},p=[125,80,100];
 const flat=Relief.project(p,cam,1000,600,.75,0),
  relief=Relief.project(p,cam,1000,600,.75,.5);
 assert.equal(flat[0],relief[0]);
 assert.equal(flat[1]-relief[1],30);
 const state=Explorer.viewState(),noRelief=Explorer.setRelief(state,0),
  restored=Explorer.setRelief(noRelief,.38);
 assert.equal(noRelief.relief,0);
 assert.equal(restored.relief,.38);
 assert.equal(Explorer.pan(restored,128,-256).relief,.38);
 assert.equal(Explorer.setZoom(restored,1.2).relief,.38);
 assert.ok(Object.isFrozen(restored));
 assert.throws(()=>Relief.project(p,cam,1000,600,0),/projection/);
});
test('contour segments interpolate real 25m elevation isohypses inside slope triangles',()=>{
 const a=[0,0,0],b=[40,50,0],c=[0,0,40],
  lines=Relief.contours(a,b,c,25);
 assert.equal(lines.length,1);
 assert.equal(lines[0].level,25);
 assert.ok(lines[0].from.every(Number.isFinite));
 assert.ok(lines[0].to.every(Number.isFinite));
 assert.equal(lines[0].from[1],25);
 assert.equal(lines[0].to[1],25);
 assert.ok(lines[0].from[0]>=0&&lines[0].from[0]<=40);
 assert.ok(lines[0].to[2]>=0&&lines[0].to[2]<=40);
 assert.equal(Relief.contours([0,10,0],[10,10,0],[0,10,10],25).length,0);
 assert.throws(()=>Relief.contours(a,b,c,0),/Invalid terrain contour/);
 assert.equal(Explorer.setContours(Explorer.viewState(),false).showContours,false);
});
test('real Canvas draws actual terrain triangles plus computed isohypse strokes',()=>{
 const values={fills:0,strokes:0};
 const ctx={fillStyle:'',strokeStyle:'',lineWidth:1,
  fillRect(){},beginPath(){},moveTo(){},lineTo(){},closePath(){},
  fill(){values.fills++},stroke(){values.strokes++},strokeRect(){}};
 const canvas={width:1280,height:720,getContext:()=>ctx},reg=Explorer.createPreviewRegistry();
 const withContours=Explorer.draw(canvas,reg,Explorer.viewState(),new Map());
 const firstStrokes=values.strokes;
 assert.equal(withContours.showContours,true);
 assert.ok(firstStrokes>1,'actual 25m contour lines must appear in Canvas');
 values.strokes=0;values.fills=0;
 const without=Explorer.draw(canvas,reg,
  Explorer.setContours(Explorer.viewState(),false),new Map());
 assert.equal(without.showContours,false);
 assert.equal(values.strokes,1,'only the camera-center crosshair remains');
 assert.equal(withContours.triangles,without.triangles);
});
test('offline browser script can initialize geometry and contour calculator entirely locally',()=>{
 const ctx=vm.createContext({});
 const tile=fs.readFileSync(path.resolve(__dirname,'../src/aden-citywide-tiles.js'),'utf8');
 const relief=fs.readFileSync(path.resolve(__dirname,'../src/aden-map-relief.js'),'utf8');
 const viewer=fs.readFileSync(path.resolve(__dirname,'../src/aden-city-explorer.js'),'utf8');
 vm.runInContext(tile,ctx);
 vm.runInContext(relief,ctx);
 vm.runInContext(viewer,ctx);
 assert.equal(typeof ctx.VeilpointAdenRelief.surfaceNormal,'function');
 assert.equal(ctx.VeilpointAdenCityExplorer.createPreviewRegistry().size,25);
 const html=fs.readFileSync(path.resolve(__dirname,'../terrain.html'),'utf8');
 const indices=[
  html.indexOf('src/aden-citywide-tiles.js'),
  html.indexOf('src/aden-map-relief.js'),
  html.indexOf('src/aden-city-explorer.js'),
  html.indexOf('src/aden-city-explorer-init.js')];
 assert.ok(indices.every(v=>v>0));
 assert.deepEqual(indices,[...indices].sort((a,b)=>a-b),
  'the browser executes shared terrain and hillshade algorithms before the actual map');
});
