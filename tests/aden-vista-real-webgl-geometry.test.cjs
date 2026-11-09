'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Sim=require('../src/simulation.js');
const PublicFootpaths=require('../src/public-city-footpaths.js');
const code=fs.readFileSync(path.resolve(__dirname,'../src/renderer.js'),'utf8');
function fakeGL(){
 const uploads=[];
 const gl={VERTEX_SHADER:1,FRAGMENT_SHADER:2,COMPILE_STATUS:3,LINK_STATUS:4,
  ARRAY_BUFFER:5,STATIC_DRAW:6,DYNAMIC_DRAW:7,FLOAT:8,TRIANGLES:9,
  DEPTH_TEST:10,LEQUAL:11,CULL_FACE:12,BACK:13,
  createShader:()=>({}),shaderSource(){},compileShader(){},getShaderParameter:()=>true,
  createProgram:()=>({}),attachShader(){},linkProgram(){},getProgramParameter:()=>true,
  useProgram(){},getAttribLocation:()=>0,getUniformLocation:()=>({}),enableVertexAttribArray(){},
  enable(){},depthFunc(){},cullFace(){},createBuffer:()=>({}),bindBuffer(){},bufferData(){},
  bufferSubData(_target,_offset,data,start,count){
   if(count>100000)uploads.push(Float32Array.from(data.subarray(start,start+count)));
  },getExtension:()=>null};
 return {gl,uploads};
}
function containsPosition(values,x,y,z){
 for(let i=0;i<values.length;i+=9)
  if(Math.abs(values[i]-x)<.0001&&Math.abs(values[i+1]-y)<.0001&&
     Math.abs(values[i+2]-z)<.0001)return true;
 return false;
}
test('real WebGL mesh generation has the Shamsan ridge crest, nonplayable sea and 48 skyline buildings',()=>{
 const context=vm.createContext({VeilpointSim:Sim,VeilpointPublicFootpaths:PublicFootpaths,
  VeilpointPerformance:{createGpuTimer(){return {begin(){return false},end(){}}}},
  devicePixelRatio:1});
 vm.runInContext(code,context);
 const {gl,uploads}=fakeGL();
 const renderer=new context.VeilpointRenderer({getContext:()=>gl,clientWidth:1280,clientHeight:720});
 assert.ok(renderer.static.count>20000);
 assert.equal(uploads.length,1,'the initial WebGL static map is uploaded exactly once');
 const current=uploads.at(-1);
 assert.ok(containsPosition(current,13,95,258),
  'the volcanic ridge peak is actual GPU-submitted triangle geometry');
 assert.ok(containsPosition(current,-534,-.24,-233),
  'western bay is an actual GPU-submitted corner, not a HUD texture');
 const home=Sim.ADEN_GEOGRAPHIC_VISTA.buildings[0];
 assert.ok(containsPosition(current,home.x-home.w/2,0,home.z-home.d/2),
  'the first low-rise shoreline building occupies actual static geometry');
 assert.equal(renderer.worldTerrainRevision,1);
 // The same nonplayable vista is available in authored CH01, not only BR.
 renderer.sceneMode='nahrin';
 renderer.static.data=[];
 renderer.generate();
 const story=uploads.at(-1);
 assert.ok(containsPosition(story,13,95,258));
 assert.ok(containsPosition(story,-534,-.24,-233));
});
test('historical revision-0 WebGL world does not retroactively gain the Aden regional vista',()=>{
 const ctx=vm.createContext({VeilpointSim:Sim,VeilpointPublicFootpaths:PublicFootpaths,
  VeilpointPerformance:{createGpuTimer(){return {begin(){return false},end(){}}}}});
 vm.runInContext(code,ctx);
 const {gl,uploads}=fakeGL();
 const render=new ctx.VeilpointRenderer({getContext:()=>gl,clientWidth:1024,clientHeight:600});
 render.worldTerrainRevision=0;
 render.static.data=[];
 render.generate();
 const old=uploads.at(-1);
 assert.equal(containsPosition(old,13,95,258),false);
 assert.equal(containsPosition(old,-534,-.24,-233),false);
 assert.equal(render.worldTerrainRevision,0);
});
