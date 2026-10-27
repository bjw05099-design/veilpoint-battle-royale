'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const Sim=require('../src/simulation.js');
const Gfx=require('../src/graphics.js');
const Perf=require('../src/performance.js');
function fakeGl(){
 let created=0;let allocations=0;const deleted=[];let viewports=[];
 const gl={VERTEX_SHADER:1,FRAGMENT_SHADER:2,COMPILE_STATUS:3,LINK_STATUS:4,ARRAY_BUFFER:5,STATIC_DRAW:6,DYNAMIC_DRAW:7,
  FLOAT:8,TRIANGLES:9,DEPTH_TEST:10,LEQUAL:11,CULL_FACE:12,BACK:13,COLOR_BUFFER_BIT:14,DEPTH_BUFFER_BIT:15,
  createShader:()=>({}),shaderSource:()=>{},compileShader:()=>{},getShaderParameter:()=>true,createProgram:()=>({}),attachShader:()=>{},linkProgram:()=>{},getProgramParameter:()=>true,
  useProgram:()=>{},getAttribLocation:()=>0,getUniformLocation:()=>({}),enableVertexAttribArray:()=>{},enable:()=>{},depthFunc:()=>{},cullFace:()=>{},
  createBuffer:()=>({id:++created}),bindBuffer:()=>{},bufferData:()=>{allocations++},bufferSubData:()=>{},vertexAttribPointer:()=>{},drawArrays:()=>{},deleteBuffer:b=>deleted.push(b.id),
  viewport:(x,y,w,h)=>viewports.push([w,h]),clearColor:()=>{},clear:()=>{},uniformMatrix4fv:()=>{},uniform3f:()=>{},uniform1f:()=>{},
  getExtension:()=>null};
 return {gl,get created(){return created},get allocations(){return allocations},deleted,get viewports(){return viewports}};
}
test('WebGL renderer reuses dynamic GPU vertex buffer across frames and honors adaptive resolution',()=>{
 const fake=fakeGl();
 const context=vm.createContext({VeilpointSim:Sim,VeilpointGraphics:Gfx,VeilpointPerformance:Perf,devicePixelRatio:1});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/renderer.js'),'utf8'),context);
 const canvas={clientWidth:800,clientHeight:600,getContext:type=>type==='webgl2'?fake.gl:null};
 const renderer=new context.VeilpointRenderer(canvas);
 assert.equal(fake.created,1,'one static GPU buffer');
 renderer.setGraphicsQuality(Gfx.fromPreset('hyperreal165'));
 const state=Sim.newMatch(5,8);
 for(let i=0;i<12;i++)renderer.draw(state);
 assert.equal(fake.created,2,'one static and one reused dynamic GPU buffer after 12 frames');
 assert.ok(fake.allocations<=3,'dynamic GPU buffer grows at most a few times, not every frame');
 const originalBuffer=renderer.dynamic.buffer;
 renderer.setAdaptiveResolution(.8);
 renderer.draw(state);
 assert.equal(renderer.dynamic.buffer,originalBuffer);
 assert.equal(canvas.width,640);assert.equal(canvas.height,480);
 assert.equal(fake.created,2,'resolution change does not allocate a new vertex buffer');
 assert.throws(()=>renderer.setAdaptiveResolution(4),e=>e.name==='RangeError');
 renderer.setGraphicsQuality(Gfx.fromPreset('balanced'));
 renderer.draw(state);
 assert.equal(fake.created,3,'changing vegetation regenerates only the static mesh');
 assert.deepEqual(fake.deleted,[1]);
});
