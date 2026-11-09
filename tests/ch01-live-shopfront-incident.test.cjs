'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const Story=require('../src/story-slice.js');
const Sim=require('../src/simulation.js');
const Graphics=require('../src/graphics.js');
const Perf=require('../src/performance.js');
const Visibility=require('../src/visibility.js');

function harness(){
 const uploads=[];
 const gl={
  VERTEX_SHADER:1,FRAGMENT_SHADER:2,COMPILE_STATUS:3,LINK_STATUS:4,
  ARRAY_BUFFER:5,STATIC_DRAW:6,DYNAMIC_DRAW:7,FLOAT:8,TRIANGLES:9,
  DEPTH_TEST:10,LEQUAL:11,CULL_FACE:12,BACK:13,COLOR_BUFFER_BIT:14,DEPTH_BUFFER_BIT:15,
  createShader:()=>({}),shaderSource:()=>{},compileShader:()=>{},getShaderParameter:()=>true,
  createProgram:()=>({}),attachShader:()=>{},linkProgram:()=>{},getProgramParameter:()=>true,
  useProgram:()=>{},getAttribLocation:()=>0,getUniformLocation:(_p,n)=>n,
  enableVertexAttribArray:()=>{},enable:()=>{},depthFunc:()=>{},cullFace:()=>{},
  createBuffer:()=>({}),bindBuffer:()=>{},bufferData:()=>{},
  bufferSubData:(_target,_offset,vertices,start,count)=>{
   uploads.push(Array.from(vertices.subarray(start,start+count)));
  },
  vertexAttribPointer:()=>{},drawArrays:()=>{},deleteBuffer:()=>{},
  viewport:()=>{},clearColor:()=>{},clear:()=>{},uniformMatrix4fv:()=>{},
  uniform3f:()=>{},uniform1f:()=>{},getExtension:()=>null
 };
 const context=vm.createContext({VeilpointSim:Sim,VeilpointGraphics:Graphics,
  VeilpointPerformance:Perf,VeilpointVisibility:Visibility,devicePixelRatio:1});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/renderer.js'),'utf8'),context);
 const renderer=new context.VeilpointRenderer({
  clientWidth:640,clientHeight:360,getContext:type=>type==='webgl2'?gl:null});
 return {context,renderer,uploads};
}
function begin(s){
 const p=s.world.player;
 p.x=Story.POINTS.terminal.x;p.z=Story.POINTS.terminal.z;
 assert.equal(Story.interact(s).phase,'engagement');
}

test('shopfront on existing solid facade visibly changes after real CH01 event and after restore',()=>{
 const h=harness(),s=Story.createState();
 const available=h.context.VeilpointStoryStreetFrontage;
 assert.equal(typeof available,'function');
 const before=available(s.world);
 assert.equal(before.length,3);
 assert.ok(Object.isFrozen(before));
 assert.ok(before.every(o=>Object.isFrozen(o)));
 const staticWalls=s.world.obstacles.filter(o=>o.type==='story-building').map(o=>({...o}));
 const worldBefore=JSON.stringify(s.world);
 h.renderer.draw(s.world);
 assert.equal(JSON.stringify(s.world),worldBefore,'visuals must never mutate world state');
 const beforeUploaded=h.uploads.at(-1);
 begin(s);
 const after=available(s.world);
 assert.equal(after.length,4);
 assert.notDeepEqual(JSON.parse(JSON.stringify(after)),JSON.parse(JSON.stringify(before)));
 assert.ok(after.some(o=>o.h>2.4),'the shutter is physically lowered on the facade');
 assert.deepEqual(s.world.obstacles.filter(o=>o.type==='story-building'),staticWalls,
  'existing solid buildings keep the same physical footprint');
 h.renderer.draw(s.world);
 assert.notDeepEqual(h.uploads.at(-1),beforeUploaded,
  'rendered geometry reacts to saved world incident rather than a HUD-only label');
 const restored=Story.restore(Story.serialize(s));
 assert.deepEqual(JSON.parse(JSON.stringify(available(restored.world))),
  JSON.parse(JSON.stringify(after)));
 const br=Sim.newMatch(22,0);
 assert.equal(available(br).length,0,'BR does not inherit campaign shop shutters');
});

test('software fallback uses the SAME changed frontage as WebGL, no duplicate city object',()=>{
 const h=harness();
 const source=fs.readFileSync(path.join(__dirname,'../src/renderer.js'),'utf8');
 assert.match(source,/for\(const part of storyStreetFrontage\(state\)\)/);
 assert.match(source,/type:'story-shop-frontage'/);
 assert.match(source,/o\.type==='story-shop-frontage'/);
 assert.match(source,/mesh\.box\(part\.x,part\.y,part\.z,part\.w,part\.h,part\.d,part\.color\)/);
 const state=Story.createState();
 const first=h.context.VeilpointStoryStreetFrontage(state.world);
 begin(state);
 const second=h.context.VeilpointStoryStreetFrontage(state.world);
 assert.ok(first.some(o=>o.canvas==='#406467'));
 assert.ok(second.some(o=>o.canvas==='#676c6d'));
});
